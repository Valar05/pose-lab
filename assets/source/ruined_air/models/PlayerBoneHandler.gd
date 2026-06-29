extends Node3D

@export var sensitivity: float = 0.2
@export var idle_turn_interval: float = .25
@export var hip_bob_amount: float = 0.1
@export var walk_cycle_duration: float = 1.0
@export var step_height := 0.15
@export var base_step_length := 2.0
@export var MIN_CADENCE := 1.2
@export var MAX_CADENCE := 2.4
@export var FACE_RATE_DEG_PER_SEC: float = 540.0  # smooth body turn speed
@export var BLEED_RATE_DEG_PER_SEC: float = 720.0 # how fast yaw offset equalizes while moving
var step_length := 0.4
var left_foot_ik_target := Vector3.ZERO
var right_foot_ik_target := Vector3.ZERO
var left_foot_base := Vector3.ZERO
var right_foot_base := Vector3.ZERO
var left_foot_planted_pos: Vector3
var right_foot_planted_pos: Vector3
var left_step_origin: Vector3
var right_step_origin: Vector3
var left_body_origin: Vector3
var right_body_origin: Vector3
var prev_left_pos: Vector3
var prev_right_pos: Vector3

var player: CharacterBody3D
var skeleton: Skeleton3D
var chest_bone: BoneAttachment3D
var chest_bone_idx: int
var hip_bone_idx: int

var move_time := 0.0
var landing_bob_boost: float = 0.0
var landing_frame: float = 0.0
var was_on_floor: bool = true
var smoothed_speed_pct := 0.0
var frequency := 0.0
var prev_left_phase: float = 0.0
var prev_right_phase: float = 0.0

var left_foot_bone_idx: int
var right_foot_bone_idx: int

var chest_rest_rotation := Vector3.ZERO
var chest_current_offset := Vector3.ZERO
var is_turning := false
var pending_yaw_deg: float = 0.0   # body yaw to apply smoothly

var right_foot_locked := false
var right_foot_turn_time := 0.0
var accumulated_body_yaw: float = 0.0
var left_foot_locked := false
var left_foot_turn_time := 0.0
var accumulated_body_yaw_left: float = 0.0

# Look state (now on CHEST)
var chest_pitch_deg: float = 0.0    # [-89..0] nose down/up (your convention)
var chest_yaw_deg: float = 0.0      # accumulated yaw offset (left/right look)

var right_foot_ik: Node3D
var left_foot_ik: Node3D

var right_foot_rest_pos: Vector3
var left_foot_rest_pos: Vector3
var left_planted_pos: Vector3
var right_planted_pos: Vector3

var left_leg_ik: SkeletonIK3D
var right_leg_ik: SkeletonIK3D
var left_foot_pole_target: Node3D
var right_foot_pole_target: Node3D
var left_leg_pole: Node3D
var right_leg_pole: Node3D

var glider: Node3D
var glider_x_lerp := 0.0
var camera: Camera3D
func _ready() -> void:
	player = get_parent()
	camera = $Armature/Skeleton3D/Head/Camera3D
	glider = $Armature/Skeleton3D/Head/Spiked_Glider

	skeleton = $Armature/Skeleton3D
	chest_bone = $Armature/Skeleton3D/Chest  # OK to keep, but don't rotate it to pose

	chest_bone_idx = skeleton.find_bone("Spine02")  # <- the real bone you want to pose
	hip_bone_idx = skeleton.find_bone("Hips")
	left_foot_bone_idx = skeleton.find_bone("LeftFoot")
	right_foot_bone_idx = skeleton.find_bone("RightFoot")

	left_leg_ik = $Armature/Skeleton3D/LeftLegIKRoot
	right_leg_ik = $Armature/Skeleton3D/RightLegIkRoot
	left_leg_pole = $Armature/Skeleton3D/LeftLegIKRoot/LeftFootPoleTarget
	right_leg_pole = $Armature/Skeleton3D/RightLegIkRoot/RightFootPoleTarget
	left_leg_ik.start()
	right_leg_ik.start()

	left_foot_ik = $"../FootIKRoot/LeftFootIK"
	right_foot_ik = $"../FootIKRoot/RightFootIK"
	left_foot_rest_pos = to_local(left_foot_ik.global_position)
	right_foot_rest_pos = to_local(right_foot_ik.global_position)

	left_step_origin = left_foot_ik.global_position
	right_step_origin = right_foot_ik.global_position

	# (Optional) zero out any BoneAttachment "Override Pose" on Chest/Head to avoid conflicts.
	if is_instance_valid(chest_bone):
		chest_bone.override_pose = false  # rely on Skeleton pose override instead

func _process(delta: float) -> void:
	# Read input from player
	var cam_vec: Vector2 = Vector2.ZERO
	if "camera_vector" in player:
		cam_vec = player.camera_vector

	# Apply look deltas to chest offsets
	if cam_vec != Vector2.ZERO:
		var d_pitch: float = cam_vec.y * sensitivity
		var d_yaw: float = -cam_vec.x * sensitivity

		# Pitch (X) — keep your clamp
		chest_pitch_deg += d_pitch
		chest_pitch_deg = clamp(chest_pitch_deg, -70.0, 100.0)

		# Yaw (Y) — allow full range; we’ll bleed into the body below
		chest_yaw_deg += d_yaw
		chest_yaw_deg = clamp(chest_yaw_deg, -180.0, 180.0)

		# Visual roll cue
		if player.is_gliding:
			var roll_impulse: float = d_yaw * delta
			if abs(roll_impulse) > glider_x_lerp or sign(roll_impulse) != sign(glider_x_lerp):
				glider_x_lerp = clamp(d_yaw * delta, -10.0, 10.0)
		else:
			glider.rotation.x = 0.0

	# Make body chase camera yaw EVERY frame (so you can turn in place too)
	pending_yaw_deg = _compute_yaw_error_deg()
	_apply_body_yaw_with_counter(delta)

	# While moving, bleed remaining chest yaw into the body so chest and body equalize
	var moving: bool = false
	if "input" in player:
		moving = player.input.length() > 0.1 or player.is_gliding
	if moving:
		_bleed_chest_yaw_into_body(delta)

	# Finally, write CHEST bone pose from chest_pitch_deg + chest_yaw_deg:
	_pose_chest_local(chest_pitch_deg, chest_yaw_deg)

	# Glider visual scale
	if is_instance_valid(glider):
		var tgt: float = 0.0001
		if player.is_gliding:
			tgt = 0.03
		var expand: bool = tgt > glider.scale.x
		var k: float = delta / 0.5
		if expand:
			k = delta / 0.25
		var s: float = lerp(glider.scale.x, tgt, k)
		glider.scale = Vector3(s, s, s)
		glider.rotation.x = lerp(glider.rotation.x, glider_x_lerp, 10.0 * delta)
		glider_x_lerp = lerp(glider_x_lerp, 0.0, 5.0 * delta)

	# Your existing bob/IK pipeline (unchanged)
	var now_on_floor: bool = player.is_on_floor()
	if not was_on_floor and now_on_floor:
		move_time = 0.75
		landing_bob_boost = 2.5
		landing_frame = float(Time.get_ticks_msec()) / 1000.0
	was_on_floor = now_on_floor

	bob(delta)
	if now_on_floor:
		update_feet_ik_grounded()
	else:
		update_feet_ik_midair()

	left_leg_ik.magnet = left_leg_pole.position
	right_leg_ik.magnet = right_leg_pole.position

# ---------------- POSE THE CHEST BONE (authoritative) -------------------

func _pose_chest_local(pitch_deg: float, yaw_deg: float) -> void:
	if chest_bone_idx < 0:
		return

	# Get the rest (local) transform of the bone
	var rest: Transform3D = skeleton.get_bone_rest(chest_bone_idx)

	# Build local rotation offsets (X = pitch, Y = yaw) in BONE SPACE
	var rot_x: Basis = Basis(Vector3(1, 0, 0), deg_to_rad(pitch_deg))
	var rot_y: Basis = Basis(Vector3(0, 1, 0), deg_to_rad(yaw_deg))

	# Order: first yaw around local Y, then pitch around local X (tweak if your rig needs)
	var local_rot: Basis = rot_y * rot_x

	# Compose pose = rest * local_rot
	var pose: Transform3D = rest
	pose.basis = rest.basis * local_rot

	# Apply as a LOCAL pose override (Godot 4.x: use set_bone_pose)
	skeleton.set_bone_pose(chest_bone_idx, pose)

# ---------------- BODY YAW CHASE (with chest counter-yaw) ---------------

func _apply_body_yaw_with_counter(delta: float) -> void:
	var max_step: float = FACE_RATE_DEG_PER_SEC * delta
	var step: float = clamp(pending_yaw_deg, -max_step, max_step)
	if abs(step) < 0.0001:
		return

	# Rotate BODY by +step (deg)
	player.rotate_y(deg_to_rad(step))

	# Counter-yaw chest by the same amount so the camera view doesn’t jump
	chest_yaw_deg -= step

	# Consume error
	pending_yaw_deg -= step

# Bleed any remaining chest yaw into the body so chest & body align while moving
func _bleed_chest_yaw_into_body(delta: float) -> void:
	var off: float = chest_yaw_deg
	if abs(off) < 0.01:
		return
	var bleed_max: float = BLEED_RATE_DEG_PER_SEC * delta
	var bleed: float = clamp(off, -bleed_max, bleed_max)

	# Move a little yaw from chest into body
	player.rotate_y(deg_to_rad(bleed))
	chest_yaw_deg -= bleed

# ---------------- Camera/Body yaw helpers -------------------------------

func _flat_cam_forward() -> Vector3:
	var cf: Vector3 = -camera.global_transform.basis.z
	return cf - Vector3.UP * cf.dot(Vector3.UP)

func _body_yaw() -> float:
	return player.global_transform.basis.get_euler().y

func _yaw_from_forward(f: Vector3) -> float:
	var fn: Vector3 = f.normalized()
	return atan2(fn.x, fn.z)

func _compute_yaw_error_deg() -> float:
	var flat: Vector3 = _flat_cam_forward()
	if flat.length_squared() < 1e-6:
		return 0.0
	var target_yaw: float = _yaw_from_forward(flat)
	var body_yaw: float = _body_yaw()
	return rad_to_deg(wrapf(target_yaw - body_yaw, -PI, PI))

# ---------------- Bob / IK (your existing functions) --------------------

func bob(delta: float) -> void:
	var max_speed: float = 5.0
	var vel_mag: float = Vector2(player.velocity.x, player.velocity.z).length()
	smoothed_speed_pct = lerp(smoothed_speed_pct, clamp(vel_mag / max_speed, 0.05, 1.0), min(delta * 10.0, 1.0))
	var speed_frac: float = clamp(vel_mag / player.SPEED, 0.0, 1.0)

	var min_cad: float = MIN_CADENCE
	var max_cad: float = MAX_CADENCE
	if landing_bob_boost > 0.0:
		var blended: float = lerp(MIN_CADENCE, MAX_CADENCE, 0.5)
		min_cad = blended
		max_cad = blended
	var cadence: float = lerp(min_cad, max_cad, speed_frac)

	step_length = vel_mag * base_step_length / (cadence * 1.8)

	move_time = fmod(move_time + delta * cadence, 1.0)
	var conditional_bob: float = 0.0
	if player.is_on_floor():
		conditional_bob = hip_bob_amount
	var bob_phase: float = sin(move_time * TAU * 2.0)
	var bob_modifier: float = smoothed_speed_pct
	if landing_bob_boost > 0.0 and bob_phase < 0.0:
		bob_modifier = 1.0 + landing_bob_boost
	position.y = bob_phase * conditional_bob * bob_modifier

	if landing_bob_boost > 0.0 and bob_phase >= 0.0:
		landing_bob_boost = 0.0


func update_feet_ik_midair() -> void:
	var left_rest := left_foot_ik.global_position.lerp(player.to_global(left_foot_rest_pos + Vector3.UP * 0.3), 0.1)
	var right_rest := right_foot_ik.global_position.lerp(player.to_global(right_foot_rest_pos + Vector3.UP * 0.3), 0.1)
	left_foot_ik.global_position = left_rest
	right_foot_ik.global_position = right_rest
	left_planted_pos = left_rest
	right_planted_pos = right_rest
	prev_left_phase = 0.0
	prev_right_phase = 0.0

func update_feet_ik_grounded() -> void:
	var stride_distance := step_length
	var stride_height := step_height
	var cycle: float = move_time

	var left_phase := fmod(cycle + 0.5, 1.0)
	var right_phase := cycle

	if smoothed_speed_pct < 0.08:
		var left_rest := left_foot_ik.global_position.lerp(player.to_global(left_foot_rest_pos), 0.1)
		var right_rest := right_foot_ik.global_position.lerp(player.to_global(right_foot_rest_pos), 0.1)
		if position.y < 0.0:
			left_rest.y += position.y
			right_rest.y += position.y
		left_foot_ik.global_position = left_rest
		right_foot_ik.global_position = right_rest
		left_planted_pos = left_rest
		right_planted_pos = right_rest
		prev_left_phase = left_phase
		prev_right_phase = right_phase
		return

	# LEFT FOOT
	if left_phase < 0.25:
		left_foot_ik.global_position = calculate_stride_global(
			left_foot_ik.global_position, left_phase, left_foot_rest_pos,
			stride_distance, stride_height, smoothed_speed_pct, player, true)
	elif left_phase < 0.75:
		if prev_left_phase <= 0.25:
			left_foot_ik.global_position = calculate_stride_global(
				left_foot_ik.global_position, 0.25, left_foot_rest_pos,
				stride_distance, stride_height, smoothed_speed_pct, player, true)
			left_planted_pos = left_foot_ik.global_position
		left_foot_ik.global_position = left_planted_pos
	else:
		left_foot_ik.global_position = calculate_stride_global(
			left_foot_ik.global_position, left_phase, left_foot_rest_pos,
			stride_distance, stride_height, smoothed_speed_pct, player, true)

	# RIGHT FOOT
	if right_phase < 0.25:
		right_foot_ik.global_position = calculate_stride_global(
			right_foot_ik.global_position, right_phase, right_foot_rest_pos,
			stride_distance, stride_height, smoothed_speed_pct, player, false)
	elif right_phase < 0.75:
		if prev_right_phase <= 0.25:
			right_foot_ik.global_position = calculate_stride_global(
				right_foot_ik.global_position, 0.25, right_foot_rest_pos,
				stride_distance, stride_height, smoothed_speed_pct, player, false)
			right_planted_pos = right_foot_ik.global_position
		right_foot_ik.global_position = right_planted_pos
	else:
		right_foot_ik.global_position = calculate_stride_global(
			right_foot_ik.global_position, right_phase, right_foot_rest_pos,
			stride_distance, stride_height, smoothed_speed_pct, player, false)

	prev_left_phase = left_phase
	prev_right_phase = right_phase

func calculate_stride_global(
	current_pos: Vector3,
	phase: float,
	rest_pos_local: Vector3,
	stride_distance: float,
	stride_height: float,
	speed_pct: float,
	body: Node3D,
	is_left_foot: bool = false
) -> Vector3:
	var rest_pos_global := body.to_global(rest_pos_local)
	var move_dir: Vector2 = player.input.normalized()
	var forward_dir := body.global_transform.origin - to_global(Vector3(move_dir.x, 0.0, move_dir.y))
	forward_dir.y = 0.0

	var start_pos := current_pos
	var target_pos := rest_pos_global
	var t := 0.0

	var body_right := body.global_transform.basis.x.normalized()
	var right_dot := forward_dir.normalized().dot(body_right)
	var angle: float = abs(asin(clamp(right_dot, -1.0, 1.0))) * 180.0 / PI
	var strafe_strength: float = clamp((angle - 45.0) / 45.0, 0.0, 1.0)

	stride_distance *= lerp(1.0, 0.4, strafe_strength)

	if phase < 0.25:
		t = phase / 0.25
		start_pos = current_pos
		target_pos = rest_pos_global + forward_dir * (stride_distance * 0.5)
	elif phase >= 0.75:
		t = (phase - 0.75) / 0.25
		start_pos = current_pos
		target_pos = rest_pos_global + Vector3.UP * (stride_height * speed_pct)
	else:
		return current_pos

	var stride_right := forward_dir.cross(Vector3.UP).normalized()
	var strafe_offset := Vector3(0.2, 0.0, 0.2)
	if is_left_foot:
		target_pos += stride_right * -strafe_offset * strafe_strength
	else:
		target_pos += stride_right * strafe_offset * strafe_strength

	return start_pos.lerp(target_pos, t)

# --- Foot twist compensation -------------------------------------------

func left_foot_turning(delta: float, overflow_y: float) -> void:
	left_foot_turn_time += delta
	if int(left_foot_turn_time / idle_turn_interval) % 2 > 0:
		accumulated_body_yaw_left = clamp(accumulated_body_yaw_left - overflow_y, -35.0, 35.0)
	else:
		accumulated_body_yaw_left = clamp(accumulated_body_yaw_left + overflow_y, -35.0, 35.0)
	var counter_rot := Basis(Vector3.UP, deg_to_rad(-accumulated_body_yaw_left))
	var rest_pose := skeleton.get_bone_rest(left_foot_bone_idx)
	var corrected_pose := rest_pose
	corrected_pose.basis = counter_rot * rest_pose.basis
	skeleton.set_bone_pose(left_foot_bone_idx, corrected_pose)

func lerp_left_foot_to_rest(delta: float) -> void:
	var rest_pose := skeleton.get_bone_rest(left_foot_bone_idx)
	var current_pose := skeleton.get_bone_pose(left_foot_bone_idx)
	var lerp_speed := 5.0 * delta
	accumulated_body_yaw_left = lerp(accumulated_body_yaw_left, 0.0, lerp_speed)
	left_foot_turn_time = lerp(left_foot_turn_time, 0.0, lerp_speed)
	current_pose.basis = current_pose.basis.slerp(rest_pose.basis, lerp_speed)
	skeleton.set_bone_pose(left_foot_bone_idx, current_pose)
	if current_pose.basis.is_equal_approx(rest_pose.basis):
		accumulated_body_yaw_left = 0.0
		left_foot_turn_time = 0.0

func right_foot_turning(delta: float, overflow_y: float) -> void:
	right_foot_turn_time += delta
	if int(right_foot_turn_time / idle_turn_interval) % 2 > 0:
		accumulated_body_yaw = clamp(accumulated_body_yaw - overflow_y, -35.0, 35.0)
	else:
		accumulated_body_yaw = clamp(accumulated_body_yaw + overflow_y, -35.0, 35.0)
	var counter_rot := Basis(Vector3.UP, deg_to_rad(-accumulated_body_yaw))
	var rest_pose := skeleton.get_bone_rest(right_foot_bone_idx)
	var corrected_pose := rest_pose
	corrected_pose.basis = counter_rot * rest_pose.basis
	skeleton.set_bone_pose(right_foot_bone_idx, corrected_pose)

func lerp_right_foot_to_rest(delta: float) -> void:
	var rest_pose := skeleton.get_bone_rest(right_foot_bone_idx)
	var current_pose := skeleton.get_bone_pose(right_foot_bone_idx)
	var lerp_speed := 5.0 * delta
	accumulated_body_yaw = lerp(accumulated_body_yaw, 0.0, lerp_speed)
	right_foot_turn_time = lerp(right_foot_turn_time, 0.0, lerp_speed)
	current_pose.basis = current_pose.basis.slerp(rest_pose.basis, lerp_speed)
	skeleton.set_bone_pose(right_foot_bone_idx, current_pose)
	if current_pose.basis.is_equal_approx(rest_pose.basis):
		accumulated_body_yaw = 0.0
		right_foot_turn_time = 0.0

func reset_chest_rotation() -> void:
	chest_bone.global_rotation_degrees = chest_rest_rotation
	chest_current_offset = Vector3.ZERO
