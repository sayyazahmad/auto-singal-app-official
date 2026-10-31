(function(){
var section=document.getElementById('scroll-stack-section');
if(!section)return;
var cards=Array.from(section.querySelectorAll('.ss-card'));
if(!cards.length)return;
var NUM=cards.length;

var ticking=false;

function getLayoutTop(el){
  var top=0;
  while(el){top+=el.offsetTop;el=el.offsetParent;}
  return top;
}

function update(){
  var scrollTop=window.scrollY;
  var vh=window.innerHeight;
  var sectionTop=getLayoutTop(section);
  var sectionH=section.offsetHeight;
  var scrollable=sectionH-vh;
  if(scrollable<=0)return;

  var localScroll=scrollTop-sectionTop;
  var progress=Math.max(0,Math.min(1,localScroll/scrollable));

  var perCard=1/NUM;

  cards.forEach(function(card,i){
    var cardStart=i*perCard;
    var cardEnd=(i+1)*perCard;

    var cardProgress;
    if(progress<cardStart) cardProgress=0;
    else if(progress>=cardEnd) cardProgress=1;
    else cardProgress=(progress-cardStart)/perCard;

    var translateY;
    if(cardProgress<=0){
      translateY=100;
    }else if(cardProgress>=1){
      translateY=0;
    }else{
      var eased=1-Math.pow(1-cardProgress,3);
      translateY=100*(1-eased);
    }

    card.style.transform='translateY('+translateY.toFixed(1)+'%)';
    card.style.zIndex=i+1;
    card.style.opacity=cardProgress>0?1:0;
  });
}

function onScroll(){
  if(!ticking){
    requestAnimationFrame(function(){ticking=false;update();});
    ticking=true;
  }
}

window.addEventListener('scroll',onScroll,{passive:true});
window.addEventListener('resize',update);
update();
})();
