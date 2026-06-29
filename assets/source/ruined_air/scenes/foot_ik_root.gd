extends Node3D

var player
func _ready():
	player = get_parent()
	var root = get_tree().get_current_scene()
	get_parent().remove_child(self)
	root.add_child(self)
	self.owner = root


func _process(delta):
	if not player:
		return
	var yaw = player.global_transform.basis.get_euler().y
	global_rotation = Vector3(0, yaw, 0)
