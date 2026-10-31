(function(){
var el=document.getElementById('galaxy-bg');
if(!el)return;
var canvas=document.createElement('canvas');
canvas.style.cssText='width:100%;height:100%;display:block;position:absolute;top:0;left:0';
el.appendChild(canvas);
var ctx=canvas.getContext('2d');
if(!ctx)return;
var W,H;
function resize(){W=canvas.width=window.innerWidth;H=canvas.height=window.innerHeight}
resize();
window.addEventListener('resize',resize);

var colors=['#E63946','#FF6B6B','#8B0000','#FF1744','#B71C1C','#ffffff','#ffffff','#ffcccc','#E63946','#ff4444','#cc0000','#ff8888'];

var STAR_COUNT=1300;
var stars=[];
for(var i=0;i<STAR_COUNT;i++){
  stars.push({
    x:Math.random()*2-1,
    y:Math.random()*2-1,
    z:Math.random()*2000+50,
    color:colors[Math.floor(Math.random()*colors.length)],
    r:Math.random()*1.4+0.2,
    alpha:Math.random()*0.8+0.2,
    twinklePhase:Math.random()*Math.PI*2,
    twinkleSpeed:Math.random()*2+0.5
  });
}

var mouse={x:0.5,y:0.5};
var smoothMouse={x:0.5,y:0.5};
window.addEventListener('pointermove',function(e){
  mouse.x=e.clientX/window.innerWidth;
  mouse.y=e.clientY/window.innerHeight;
});

var angle=0;
function draw(t){
  ctx.clearRect(0,0,W,H);

  smoothMouse.x+=(mouse.x-smoothMouse.x)*0.04;
  smoothMouse.y+=(mouse.y-smoothMouse.y)*0.04;
  var mx=(smoothMouse.x-0.5)*2;
  var my=(smoothMouse.y-0.5)*2;
  angle+=0.0003;

  var cx=W/2;
  var cy=H/2;
  var time=t*0.001;

  for(var i=0;i<stars.length;i++){
    var s=stars[i];
    s.z-=1.5;
    if(s.z<1){
      s.z=2000;
      s.x=Math.random()*2-1;
      s.y=Math.random()*2-1;
    }

    var cosA=Math.cos(angle*0.3);
    var sinA=Math.sin(angle*0.3);
    var rx=s.x*cosA-s.y*sinA;
    var ry=s.x*sinA+s.y*cosA;

    var proj=W/(s.z+200);
    var sx=cx+rx*W*0.8*proj+mx*W*0.03*proj;
    var sy=cy+ry*H*0.8*proj+my*H*0.03*proj;

    if(sx<-20||sx>W+20||sy<-20||sy>H+20)continue;

    var flicker=Math.sin(time*s.twinkleSpeed+s.twinklePhase);
    var a=s.alpha*(0.6+flicker*0.4)*(s.z<300?((s.z+50)/350):1);
    var size=s.r*proj*2;
    if(size<0.1)continue;
    if(size>6)size=6;

    var stretch=s.z<600?(600-s.z)/600*6:0;
    if(stretch>0.5){
      var angleToCenter=Math.atan2(sy-cy,sx-cx);
      var ex=sx+Math.cos(angleToCenter)*stretch*proj*300;
      var ey=sy+Math.sin(angleToCenter)*stretch*proj*300;
      ctx.globalAlpha=a*0.8;
      ctx.beginPath();
      ctx.moveTo(sx,sy);
      ctx.lineTo(ex,ey);
      ctx.strokeStyle=s.color;
      ctx.lineWidth=size*0.5;
      ctx.shadowBlur=size*3;
      ctx.shadowColor=s.color;
      ctx.stroke();
    }else{
      ctx.globalAlpha=a;
      ctx.beginPath();
      ctx.arc(sx,sy,size,0,Math.PI*2);
      ctx.fillStyle=s.color;
      ctx.shadowBlur=size*6;
      ctx.shadowColor=s.color;
      ctx.fill();
    }
  }

  ctx.shadowBlur=0;
  ctx.globalAlpha=1;
}
function loop(t){requestAnimationFrame(loop);draw(t)}
requestAnimationFrame(loop);
})();
