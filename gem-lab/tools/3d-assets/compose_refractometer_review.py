"""Compose pre-existing review renders; source photos stay outside public and docs."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
P=Path(__file__).resolve().parents[2]; T=P/'assets-source/refractometer/tripo-trials/2026-10-07/repair-v1';R=T/'renders';REF=P/'assets-source/refractometer/references'
FONT='/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
def font(n):
 try:return ImageFont.truetype(FONT,n)
 except OSError:return ImageFont.load_default(size=n)
def panel(canvas,source,box,title):
 x,y,w,h=box;im=Image.open(source).convert('RGB');im=ImageOps.contain(im,(w,h-62),Image.Resampling.LANCZOS);canvas.paste(im,(x+(w-im.width)//2,y+54+(h-62-im.height)//2));ImageDraw.Draw(canvas).text((x+20,y+8),title,font=font(25),fill='#233047')
c=Image.new('RGB',(2400,940),'#f0f2f5');d=ImageDraw.Draw(c);d.text((24,12),'宝石折射仪｜参考—原候选—重建资产',font=font(35),fill='#182638')
for i,(name,p) in enumerate([('官方参考 / Gem-A',REF/'gem-a-ref0006-front.jpg'),('Tripo 原始候选 / H3.1',R/'candidate-reference-angle.png'),('重建资产 / 9 部件',R/'reference-angle.png')]):panel(c,p,(i*800,70,800,810),name)
d.text((28,900),'近似同角度对照；并非透视配准或实测比例。原图仅用于本地审阅，未进入网页资产。',font=font(24),fill='#536276');c.save(R/'reference-comparison.jpg',quality=92)
c=Image.new('RGB',(2100,1510),'#f0f2f5');d=ImageDraw.Draw(c);d.text((24,10),'宝石折射仪｜六视图（默认开盖）',font=font(34),fill='#182638')
for i,(n,label) in enumerate([('front','正面 / 目镜侧'),('back','背面 / 示意进光口'),('left','左侧'),('right','右侧'),('top','俯视'),('bottom','仰视')]):panel(c,R/(n+'.png'),((i%3)*700,65+(i//3)*700,700,700),label)
d.text((28,1470),'教学设计尺寸未校准；内部结构及后进光口见 provenance 的示意边界。',font=font(24),fill='#536276');c.save(R/'six-views.jpg',quality=92)
print(R/'reference-comparison.jpg');print(R/'six-views.jpg')
