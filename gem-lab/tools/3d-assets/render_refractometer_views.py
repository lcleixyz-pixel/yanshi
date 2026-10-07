"""Refresh six technical orthographic views from editable studio; no geometry/model changes."""
from pathlib import Path
import bpy
from mathutils import Vector
P=Path(__file__).resolve().parents[2];T=P/'assets-source/refractometer/tripo-trials/2026-10-07/repair-v1';R=T/'renders'
bpy.ops.wm.open_mainfile(filepath=str(T/'refractometer-studio.blend'))
s=bpy.context.scene;s.cycles.samples=40;s.render.resolution_x=1000;s.render.resolution_y=1000;s.render.resolution_percentage=100
bpy.data.objects['Studio floor'].hide_render=True
cam=s.camera;cam.data.ortho_scale=.31
for name,pos in [('front',(0,-.5,.082)),('back',(0,.5,.082)),('left',(-.5,0,.082)),('right',(.5,0,.082)),('top',(0,0,.58)),('bottom',(0,0,-.5))]:
 cam.location=pos;cam.rotation_euler=(Vector((0,0,.083))-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(R/(name+'.png'));bpy.ops.render.render(write_still=True)
