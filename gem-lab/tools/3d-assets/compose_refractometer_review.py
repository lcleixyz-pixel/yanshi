"""Compose pre-existing review renders; source photos stay outside public and docs."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
P=Path(__file__).resolve().parents[2]; T=P/'assets-source/refractometer/tripo-trials/2026-10-07/repair-v3';R=T/'renders';REF=P/'assets-source/refractometer/references'
FONT='/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
def font(n):
 try:return ImageFont.truetype(FONT,n)
 except OSError:return ImageFont.load_default(size=n)
def panel(canvas,source,box,title):
 x,y,w,h=box;original=Image.open(source).convert('RGBA');background=Image.new('RGBA',original.size,'#f0f2f5');background.alpha_composite(original);im=background.convert('RGB');im=ImageOps.contain(im,(w,h-62),Image.Resampling.LANCZOS);canvas.paste(im,(x+(w-im.width)//2,y+54+(h-62-im.height)//2));ImageDraw.Draw(canvas).text((x+20,y+8),title,font=font(25),fill='#233047')
c=Image.new('RGB',(2000,1100),'#f0f2f5');d=ImageDraw.Draw(c);d.text((24,12),'白色宝石折射仪｜第 3 轮参考—参数化重建',font=font(35),fill='#182638')
for i,(name,p) in enumerate([('项目原图 / 用户已有材料',REF/'折射仪_产品图.png'),('重建资产 / 14部件 / 165 mm示意',R/'reference-angle.png')]):panel(c,p,(i*1000,70,1000,960),name)
d.text((28,1050),'近似同角度对照；非透视配准或实测比例。原图只用于本地审阅，不进入网页资产。',font=font(24),fill='#536276');c.save(R/'reference-comparison.jpg',quality=92)
c=Image.new('RGB',(2100,1510),'#f0f2f5');d=ImageDraw.Draw(c);d.text((24,10),'白色宝石折射仪｜第 3 轮六视图（默认开盖100°）',font=font(34),fill='#182638')
for i,(n,label) in enumerate([('front','正面 / 目镜侧'),('back','背面'),('left','左侧'),('right','右侧'),('top','俯视'),('bottom','仰视')]):panel(c,R/(n+'.png'),((i%3)*700,65+(i//3)*700,700,700),label)
d.text((28,1470),'教学尺寸未校准；光源、双镜、标尺和双透镜为示意；刻线未校准；油瓶可独立隐藏。',font=font(24),fill='#536276');c.save(R/'six-views.jpg',quality=92)
print(R/'reference-comparison.jpg');print(R/'six-views.jpg')
c=Image.new('RGB',(2100,1250),'#f0f2f5');d=ImageDraw.Draw(c)
d.text((24,10),'白色宝石折射仪｜第 3 轮结构与光路审阅',font=font(34),fill='#182638')
for i,(n,label) in enumerate([('cover-closed','盒形盖 / 前沿斜面'),('stage-closeup','白台阶 / 缩小钢台 / 深色窗口'),('optical-path-schematic','通用光路示意 / 60°主线与临界角扇')]):
 panel(c,R/(n+'.png'),(i*700,70,700,1060),label)
d.text((28,1160),'主线检查至目镜轴线；17条角扇只检查至标尺。透镜成像、刻线与尺寸未校准。',font=font(25),fill='#536276')
c.save(R/'optical-review.jpg',quality=92);print(R/'optical-review.jpg')
