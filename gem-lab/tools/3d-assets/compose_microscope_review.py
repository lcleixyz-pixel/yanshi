"""Compose round-4 microscope review sheets after the Blender build.

Uses Pillow only. Manufacturer images stay under ignored assets-source.
This creates image comparisons; it does not perform optical verification.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
from microscope_round3_geometry import IRIS_MIN, IRIS_MAX, UNIT

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'assets-source/gem-microscope'
WORK=SOURCE/'tripo-trials/2026-10-07/repair-v4'
FONT='/System/Library/Fonts/Supplemental/Arial Unicode.ttf'


def font(size):
    try:return ImageFont.truetype(FONT,size)
    except OSError:return ImageFont.load_default(size=size)


def panel(canvas,path,x,y,w,h,title):
    with Image.open(path) as opened:src=opened.convert('RGBA')
    flat=Image.new('RGBA',src.size,'#e5e8eb');flat.alpha_composite(src)
    image=ImageOps.contain(flat.convert('RGB'),(w-20,h-60),Image.Resampling.LANCZOS)
    canvas.paste(image,(x+(w-image.width)//2,y+50+(h-60-image.height)//2))
    ImageDraw.Draw(canvas).text((x+18,y+8),title,font=font(25),fill='#243447')


def title(canvas,text):ImageDraw.Draw(canvas).text((28,16),text,font=font(34),fill='#172b40')


def main():
    manifest=json.loads((ROOT/'public/assets/3d/gem-microscope/structure-v1/manifest.json').read_text())
    if (manifest.get('version'),manifest.get('revision'))!=('structure-4','repair-v4'):
        raise SystemExit('Run round-4 Blender build first; do not relabel older renders as round 4.')
    required=[WORK/(name+'.png') for name in ['reference-angle','front','rear','left','right','top','bottom','lamp-housing-closeup','lamp-housing-cutaway','iris-angle-00','iris-angle-45','iris-angle-90']]
    missing=[str(p.relative_to(ROOT)) for p in required if not p.is_file()]
    if missing:raise SystemExit('Missing round-4 renders: '+', '.join(missing))
    canvas=Image.new('RGB',(2400,1120),'#f0f2f4');title(canvas,'宝石显微镜｜厂家外观参考、原始云候选与第 4 轮重建')
    entries=[('厂家图 / 本地外观参考',SOURCE/'references/kruess-ksw6000-product-original.jpg'),
             ('原始 Tripo 候选 / 历史未修改',WORK.parent/'repair-v1/candidate-front-angle.png'),
             ('第 4 轮 / 约 40 cm 教学比例',WORK/'reference-angle.png')]
    for i,(label,path) in enumerate(entries):panel(canvas,path,800*i,75,800,960,label)
    ImageDraw.Draw(canvas).text((28,1060),'近似机位对照；内部照明是通用教学示意；厂家图及本对照仅保留在 assets-source。',font=font(25),fill='#526175')
    canvas.save(WORK/'reference-comparison.jpg',quality=94)
    canvas=Image.new('RGB',(2100,1570),'#f0f2f4');title(canvas,'宝石显微镜｜整体构型参考（安装净空修正前）')
    for i,(name,label) in enumerate([('front','正面 / 正前箱式顶灯'),('rear','背面 / 后白色立柱'),('left','左侧 / C 形镜臂'),('right','右侧 / 立柱调焦大旋钮'),('top','俯视 / 长方形载物台'),('bottom','仰视')]):
        panel(canvas,WORK/(name+'.png'),i%3*700,80+i//3*700,700,700,label)
    ImageDraw.Draw(canvas).text((28,1525),'此组保留作整体形态参考；夹座、拨杆与导轨最终安装以新装配图、近景和当前 GLB 为准。',font=font(24),fill='#526175')
    canvas.save(WORK/'six-views.jpg',quality=94)
    canvas=Image.new('RGB',(2100,850),'#f0f2f4');title(canvas,'虹彩光阑｜倒角薄叶与单调孔径')
    for i,angle in enumerate([0,45,90]):
        diameter=2*(IRIS_MIN+(IRIS_MAX-IRIS_MIN)*angle/90)*UNIT*1000
        panel(canvas,WORK/('iris-angle-%02d.png'%angle),i*700,85,700,680,'环 %d° / 标称孔径 %.2f mm'%(angle,diameter))
    ImageDraw.Draw(canvas).text((28,794),'12 片哑光弧形叶片位于互不相交薄层；ApertureOpen 形变为教学近似。',font=font(24),fill='#526175')
    canvas.save(WORK/'iris-aperture-comparison.jpg',quality=94)
    canvas=Image.new('RGB',(2300,1110),'#f0f2f4');title(canvas,'台下照明器｜安装支撑与去壳结构检查')
    panel(canvas,WORK/'lamp-housing-closeup.png',0,85,1150,925,'装配近景 / 插片沿固定导轨推入')
    panel(canvas,WORK/'lamp-housing-cutaway.png',1150,85,1150,925,'去壳查看 / 底盖—灯座—光源—中性反射碗')
    ImageDraw.Draw(canvas).text((28,1047),'右图隐藏完整外壳与部分外围件；双焦点反射与安装结构为教学示意，不代表厂家剖面或实测照度。',font=font(23),fill='#526175')
    canvas.save(WORK/'lamp-housing-comparison.jpg',quality=94)
    (WORK/'review.html').write_text('''<!doctype html><html lang="zh"><meta charset="utf-8"><title>显微镜第4轮本地审阅</title><style>body{margin:30px;background:#e9eef2;font:18px system-ui;color:#253446}img{width:100%;max-width:1400px;display:block;margin:20px auto}p{max-width:1000px}</style><h1>宝石显微镜 · 第 4 轮</h1><p>长方形厚台、C 形镜臂、正前方45°顶灯、独立底灯 / 顶灯 / 光纤出光端、双焦点椭球反射碗、可移挡板与拨杆、磨砂漫射板、起偏与检偏夹片。统一米制约40 cm；内部照明为通用教学示意，未做照度或偏振模拟。</p><p>厂家图与含原图的对照仅供本地参考，未确认再分发许可。8种照明方式、透明暗域筒、光阑全程和调焦联动还须在独立审阅页逐项验收；本拼图不会替代浏览器检查或用户外观验收。</p><img src="reference-comparison.jpg" alt="厂家参考、历史云候选与第4轮模型对照"><img src="six-views.jpg" alt="第4轮六视图"><img src="iris-aperture-comparison.jpg" alt="虹彩0、45、90度孔径变化"></html>''',encoding='utf-8')
    review=WORK/'review.html'
    html=review.read_text().replace('<img src="six-views.jpg" alt="第4轮六视图">','<p>下方六视图来自本轮安装净空修正前，仅保留作整体构型参考，不是最终附件位置证据。最新夹座、低位拨杆和导轨以装配图、近景与当前 GLB 为准。</p><img src="six-views.jpg" alt="安装净空修正前的整体构型参考">')
    html=html.replace('</html>','<img src="lamp-housing-comparison.jpg" alt="灯室装配近景与去壳结构"><p>第4轮补足台下灯室底盖、连续灯座支撑、上安装法兰及三块附件的固定导轨和滑座；白色承重底座中没有挪入灯源。以上静帧只用于结构审阅，网页受光效果另行验证。</p></html>')
    review.write_text(html,encoding='utf-8')
    print(WORK/'reference-comparison.jpg')


if __name__=='__main__':main()
