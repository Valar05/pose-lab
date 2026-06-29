extends CharacterBody3D

# ─── Move constants
const WALK_SPEED: float = 1.5
const SPEED: float = 5.0
const JUMP_VELOCITY: float = 4.5
const GRAVITY: float = 9.8

# ─── Aerodynamics (glide)
@export var MASS: float = 30
@export var WING_AREA: float = 3
@export var RHO: float = 1.225

@export var CL0: float = 0.6
@export var CL_ALPHA: float = 4.0
@export var CL_MAX: float = 1.8
@export var CD0: float = 0.6
@export var INDUCED_K: float = 0.15

@export var ALPHA_TRIM_DEG: float = 8.0
@export var ALPHA_STALL_DEG: float = 25.0
@export var MAX_SPEED: float = 55.0

# ─── Jet boost (adds to aero)
@export var BOOST_ACCEL: float = 12.0          # m/s^2 at full throttle
@export var DRAG_COEFF: float = 0.02           # extra quadratic drag (stability)
@export var HEAT_MAX: float = 100.0
@export var HEAT_GEN_PER_SEC: float = 50
@export var HEAT_COOL_PER_SEC: float = 5
@export var HEAT_OVERHEAT_COOL_PER_SEC: float = 5.0
@export var HEAT_RESUME_AT: float = 65.0
@export var BOOST_STEER_RATE: float = 6.0      # turn rate while boosting (1/sec)
@export var BOOST_STEER_MIN_SPEED: float = 2.0 # snap a bit if you're nearly stopped

@export var GLIDE_STEER_RATE: float = 6     # slower turn rate while just gliding
@export var GLIDE_STEER_MIN_SPEED: float = 1.0

# ─── Rotation tuning
const ALIGN_RATE_WORLD: float = 12.0

# ─── State
var dpad: Node = null
var is_moving := false
var double_jump := true
var jump_held := false
var time_since_hold := 0.0
var hold_duration := 0.0
var prev_hold_duration := 0.0
var is_gliding := true
var overheated := false
var heat: float = 0.0
var anim_player
var _g_mul: float = 1.0
var time_last_touched: float = 0.0
var touch_traveled:  float = 0.0
var jump_button
var glide_button
var is_right_button_pushed := false
var attack_number = 0

# ─── Camera / input
@export var sensitivity: float = 0.2
@export var idle_turn_interval: float = 1.0
var camera_vector: Vector2 = Vector2.ZERO
var last_drag_pos: Vector2 = Vector2.ZERO
var camera: Camera3D = null

# ─── Movement helpers
var input: Vector2 = Vector2.ZERO
var move_accel: float = 0.0
const ACCEL_RATE: float = 0.3

@onready var bone_handler: Node = $Model

# ──────────────────────────────────────────
# Helpers

func _project_on_plane(v: Vector3, n: Vector3) -> Vector3:
	return v - n * v.dot(n)

func _basis_from_up_forward(up: Vector3, forward: Vector3) -> Basis:
	var u := up.normalized()
	var f := _project_on_plane(forward, u)
	if f.length_squared() < 1e-10:
		f = Vector3.FORWARD
	f = f.normalized()
	var r := f.cross(u)
	if r.length_squared() < 1e-10:
		r = u.cross(Vector3(1,0,0))
		if r.length_squared() < 1e-10:
			r = u.cross(Vector3(0,0,1))
	return Basis(r.normalized(), u, -f).orthonormalized()

func _slerp_body_to_basis(target: Basis, rate: float, delta: float) -> void:
	var q_from := Quaternion(global_transform.basis).normalized()
	var q_to := Quaternion(target).normalized()
	var q := q_from.slerp(q_to, clamp(delta * rate, 0.0, 1.0))
	global_transform.basis = Basis(q).orthonormalized()

# ──────────────────────────────────────────

func _ready() -> void:
	dpad = $"../DPad"
	camera = $Model/Armature/Skeleton3D/Head/Camera3D
	anim_player = $Model/AnimationPlayer
	anim_player.play("Armature|Idle")
	jump_button = $CanvasLayer/JumpButton
	glide_button = $CanvasLayer/GlideButton

func _physics_process(delta: float) -> void:
	if position.y < -100:
		get_tree().reload_current_scene()
	is_right_button_pushed = false
	# Input
	if dpad and "input_vector" in dpad:
		input = dpad.input_vector
	else:
		input = Vector2.ZERO

	is_moving = input.length() > 0.1
	var on_floor := is_on_floor()

	# Orientation when not gliding: upright to world, keep yaw
	if not is_gliding:
		var cur_forward := -global_transform.basis.z
		var upright_basis := _basis_from_up_forward(Vector3.UP, cur_forward)
		_slerp_body_to_basis(upright_basis, ALIGN_RATE_WORLD, delta)

	# Ground locomotion (when not gliding)
	var move_speed := (SPEED if input.length() > 0.5 else WALK_SPEED)
	if is_moving or is_gliding:
		if bone_handler and "face_forward_step" in bone_handler:
			bone_handler.face_forward_step(delta)
		move_accel = min(move_accel + delta / ACCEL_RATE, 1.0)
	else:
		move_accel = max(move_accel - delta * 2.0, 0.0)

	if not is_gliding:
		var yaw := global_transform.basis.get_euler().y
		var fwd := -Vector3(sin(yaw), 0.0, cos(yaw)).normalized()
		var right := Vector3(-cos(yaw), 0.0, sin(yaw)).normalized()
		var desired_vel: Vector3 = (fwd * input.y + right * input.x).normalized() * move_speed * move_accel
		velocity.x = lerp(velocity.x, desired_vel.x, delta * 10.0)
		velocity.z = lerp(velocity.z, desired_vel.z, delta * 10.0)

	# Gravity (ground/air when NOT gliding)
	if jump_held:
		time_since_hold = Time.get_ticks_msec() / 1000.0
		hold_duration += delta


	var jump_grace: float = 1.0
	var jump_low_g: float = 0.1
	var jump_time: float = Time.get_ticks_msec() / 1000.0 - time_since_hold
	if velocity.y <= 0.0 and prev_hold_duration > 0.25:
		if jump_time < jump_grace:
			var t: float = clamp(jump_time / jump_grace, 0.0, 1.0)
			var ease_val: float = t * t * (3.0 - 2.0 * t)
			_g_mul = lerp(jump_low_g, 1.0, ease_val)
		else:
			_g_mul = 1.0
	else:
		_g_mul = lerp(_g_mul, 1.0, delta * 8.0)

	if not on_floor and not is_gliding:
		velocity.y -= GRAVITY * delta * _g_mul
		if jump_held:
			velocity.y += GRAVITY * 0.8 * delta

	# Glide physics + optional jet boost
	if is_gliding:
		_apply_glide_aero_with_boost(delta)

	# Single move_and_slide per frame
	move_and_slide()

	# Exit glide on ground
	if is_gliding and on_floor:
		_snap_body_yaw_to_camera_flat()
		is_gliding = false

func _is_touch_inside_button(button: TouchScreenButton, global_point: Vector2) -> bool:
	if button and button.shape:
		var local_point = button.to_local(global_point)
		return button.shape.point_is_inside(local_point)
	return false

func _snap_body_yaw_to_camera_flat() -> void:
	var cam_basis: Basis = camera.global_transform.basis
	var cam_forward: Vector3 = (cam_basis.z).normalized()
	var cam_flat: Vector3 = _project_on_plane(cam_forward, Vector3.UP).normalized()
	if cam_flat.length_squared() < 1e-6:
		# fallback to current body forward flattened
		var body_fwd: Vector3 = -global_transform.basis.z
		cam_flat = _project_on_plane(body_fwd, Vector3.UP).normalized()

	var snap_basis: Basis = _basis_from_up_forward(Vector3.UP, cam_flat)
	global_transform.basis = snap_basis

func _apply_glide_aero_with_boost(delta: float) -> void:
	# ---- AERODYNAMICS ----
	var fwd: Vector3 = -global_transform.basis.z.normalized()

	var v_air: Vector3 = velocity
	var speed: float = v_air.length()

	var e_v: Vector3
	if speed > 1e-6:
		e_v = v_air / speed
	else:
		e_v = fwd

	var flat_fwd: Vector3 = (fwd - Vector3.UP * fwd.dot(Vector3.UP)).normalized()
	if flat_fwd.length_squared() < 1e-6:
		flat_fwd = Vector3.FORWARD
	var theta: float = atan2(fwd.dot(Vector3.UP), fwd.dot(flat_fwd))

	var flat_v: Vector3 = (e_v - Vector3.UP * e_v.dot(Vector3.UP)).normalized()
	var gamma: float = atan2(e_v.dot(Vector3.UP), e_v.dot(flat_v))

	var alpha_trim: float = deg_to_rad(ALPHA_TRIM_DEG)
	var alpha: float = clamp(theta - gamma + alpha_trim, deg_to_rad(-ALPHA_STALL_DEG), deg_to_rad(ALPHA_STALL_DEG))

	var CL_lin: float = CL0 + CL_ALPHA * alpha
	var CL: float = clamp(CL_lin, -CL_MAX, CL_MAX)
	var CD: float = CD0 + INDUCED_K * CL * CL
	var q: float = 0.5 * RHO * speed * speed

	var lift_dir: Vector3 = (Vector3.UP - e_v * e_v.dot(Vector3.UP))
	if lift_dir.length_squared() < 1e-6:
		var right_fallback: Vector3 = global_transform.basis.x.normalized()
		lift_dir = (right_fallback - e_v * e_v.dot(right_fallback))
	lift_dir = lift_dir.normalized()

	var F_lift: Vector3 = lift_dir * (q * WING_AREA * CL)
	var F_drag: Vector3 = -e_v     * (q * WING_AREA * CD)
	var accel: Vector3 = (F_lift + F_drag) / MASS + Vector3(0.0, -GRAVITY, 0.0)

	# ---- CAMERA-RELATIVE CONTROL / THRUST ----
	var cam_basis: Basis = camera.global_transform.basis
	var cam_forward: Vector3 = (-cam_basis.z).normalized()                           # full 3D (pitch included)
	var cam_right: Vector3 = _project_on_plane(cam_basis.x, Vector3.UP).normalized() # strafe flattened to ground

	# Input → camera-space control vector (note: stick up is -1 on y)
	var control_vec: Vector3 = cam_right * input.x + cam_forward * (-input.y)
	var control_len: float = control_vec.length()
	var control_mag: float = clamp(control_len, 0.0, 1.0)

	var thrust_dir: Vector3 = fwd
	if control_len > 1e-6:
		thrust_dir = control_vec / control_len
	var thrust_mag: float = control_mag

	# Heat / overheat from thrust demand
	var boosting: bool = false
	if overheated:
		heat = max(0.0, heat - HEAT_OVERHEAT_COOL_PER_SEC * delta)
		if heat <= HEAT_RESUME_AT:
			overheated = false
	else:
		if thrust_mag > 1e-4:
			heat = min(HEAT_MAX, heat + HEAT_GEN_PER_SEC * thrust_mag * delta)
			if heat >= HEAT_MAX:
				overheated = true
				thrust_mag = 0.0
		else:
			heat = max(0.0, heat - HEAT_COOL_PER_SEC * delta)

	# Apply jet thrust when allowed
	if thrust_mag > 1e-4 and not overheated:
		boosting = true
		accel += thrust_dir * (BOOST_ACCEL * thrust_mag)

	# Extra quadratic drag for high-speed stability
	if speed > 1e-3:
		accel += (-e_v * DRAG_COEFF * speed * speed) / max(1.0, MASS)

	# Integrate accel
	velocity += accel * delta

	# ---- 3D STEERING (boost and glide) ----
	var vlen: float = velocity.length()
	if vlen > 1e-5:
		var cur_dir: Vector3 = velocity / vlen

		# Desired steer target:
		# - If there is input, steer toward camera-relative control/thrust dir (3D).
		# - If no input, still steer toward camera forward (3D) so you can pitch/yaw while coasting.
		var want_dir: Vector3 = cam_forward
		if control_len > 1e-6:
			want_dir = thrust_dir
		want_dir = want_dir.normalized()

		var rate: float = GLIDE_STEER_RATE
		var min_spd: float = GLIDE_STEER_MIN_SPEED
		if boosting:
			rate = BOOST_STEER_RATE
			min_spd = BOOST_STEER_MIN_SPEED

		var steer_t: float = clamp(rate * delta, 0.0, 1.0)  # you said no control_mag scaling
		if vlen < min_spd:
			steer_t = max(steer_t, 0.5)  # snap a bit when nearly stopped

		# Blend direction in 3D and preserve speed
		var new_dir: Vector3 = cur_dir.lerp(want_dir, steer_t).normalized()
		velocity = new_dir * vlen

	# Cap speed
	vlen = velocity.length()
	if vlen > MAX_SPEED:
		velocity = velocity * (MAX_SPEED / vlen)


# ─── Input
func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenDrag and event.position.x > get_viewport().get_visible_rect().size.x / 2.0:
		touch_traveled += (event.position - last_drag_pos).length()
		if (event.position - last_drag_pos).length() > 10:
			camera_vector = event.screen_relative
			last_drag_pos = event.position
		else:
			camera_vector = Vector2.ZERO
	elif event is InputEventScreenTouch and not event.pressed:
		camera_vector = Vector2.ZERO
		if Time.get_ticks_msec() / 1000.0 - time_last_touched < 0.3 && touch_traveled < 100:
			attack()
	elif event is InputEventScreenTouch and event.pressed:
		if not is_right_button_pushed:
			time_last_touched = Time.get_ticks_msec() / 1000.0
			touch_traveled = 0.0

func attack():
	attack_number = (attack_number + 1) % 6
	anim_player.play("Armature|Swing" + str(attack_number))

func _on_jump_button_pressed() -> void:
	is_right_button_pushed = true
	jump_held = true
	prev_hold_duration = 0.0
	if is_on_floor():
		velocity.y = JUMP_VELOCITY
		double_jump = true
	elif double_jump:
		velocity.y = JUMP_VELOCITY
		double_jump = false

func _on_jump_button_released() -> void:
	jump_held = false
	prev_hold_duration = hold_duration
	hold_duration = 0.0

func _on_glide_button_pressed() -> void:
	# Toggle glide (no start-velocity seeding)
	is_right_button_pushed = true
	if is_gliding:
		is_gliding = false
		_snap_body_yaw_to_camera_flat()
	else:
		if not is_on_floor():
			is_gliding = true
			velocity = -camera.global_basis.z * BOOST_ACCEL
