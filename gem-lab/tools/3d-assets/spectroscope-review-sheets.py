"""Build review-only sheets; source-photo pixels stay under ignored assets-source."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont, ImageChops
import argparse, json, hashlib
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--instrument',choices=['prism-spectroscope','grating-spectroscope'],required=True);a=p.parse_args();root=ROOT/'assets-source'/a.instrument;trial=root/'tripo-trials/2026-10-07';repair=trial/'repair-v1';renders=repair/'renders';font=ImageFont.load_default(size=24);small=ImageFont.load_default(size=17)
def pasted(canvas,img,box,crop=False):
 img=img.convert('RGB')
 if crop:
  bg=Image.new('RGB',img.size,img.getpixel((3,3)));diff=ImageChops.difference(img,bg).convert('L').point(lambda x:255 if x>22 else 0);bounds=diff.getbbox()
  if bounds:img=img.crop(bounds)
 img=ImageOps.contain(img,(box[2]-box[0],box[3]-box[1]));canvas.paste(img,(box[0]+(box[2]-box[0]-img.width)//2,box[1]+(box[3]-box[1]-img.height)//2))
canvas=Image.new('RGB',(1800,1390),'white');d=ImageDraw.Draw(canvas);d.text((25,18),a.instrument+' | Six orthographic views',font=font,fill='#182332')
for i,name in enumerate(['front','back','left','right','top','bottom']):
 x=(i%3)*600;y=60+(i//3)*660;pasted(canvas,Image.open(renders/(name+'.png')),(x+10,y+40,x+590,y+620));d.text((x+20,y+10),name.upper(),font=font,fill='#243047')
d.text((25,1370),'Same scale in all six views. Optical axis: entry -Z -> observer +Z. Dimensions not calibrated.',font=small,fill='#324052');canvas.save(renders/'six-views.png')
ref=root/'references'/('gem-a-prism-product.png' if a.instrument.startswith('prism') else 'gia-grating-product.jpg')
canvas=Image.new('RGB',(2000,1200),'white');d=ImageDraw.Draw(canvas);d.text((30,24),a.instrument+' | Reference / reconstructed asset',font=font,fill='#182332');d.text((30,67),'Approximate matching view; not calibrated photogrammetry. Manufacturer reference stays in source archive.',font=small,fill='#465269')
for i,(img,label) in enumerate([(Image.open(ref),'Published product reference'),(Image.open(renders/'reference-angle.png'),'Unbranded teaching reconstruction')]):
 x=30+i*990;pasted(canvas,img,(x,130,x+950,1060),True);d.text((x,1100),label,font=font,fill='#182332')
canvas.save(renders/'reference-comparison.png')
raw=repair/'analysis/raw-candidate.png'
if raw.exists():
 canvas=Image.new('RGB',(2000,1160),'white');d=ImageDraw.Draw(canvas);d.text((30,20),a.instrument+' | Raw Tripo candidate / reconstruction',font=font,fill='#182332')
 for i,(img,label) in enumerate([(Image.open(raw),'Original Tripo candidate (unchanged)'),(Image.open(renders/'hero.png'),'Reference-constrained reconstructed parts')]):
  x=30+i*990;pasted(canvas,img,(x,100,x+950,1060),True);d.text((x,1090),label,font=font,fill='#182332')
 canvas.save(renders/'candidate-comparison.png')
print(renders)
