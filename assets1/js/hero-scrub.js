/* Scroll-scrubbed image-sequence hero. main.js writes --hero-p (0..1) on #hero;
   this draws the matching frame to a cover-fit canvas, eased toward the target. */
(function(){
  var hero=document.getElementById('hero');if(!hero)return;
  var media=hero.querySelector('[data-hero-media]'),canvas=hero.querySelector('[data-hero-canvas]');
  if(!media||!canvas)return;
  var mob=matchMedia('(max-width:780px)').matches,d=hero.dataset,k=mob?'heroM':'hero';
  var N=+d[k+'Frames']||1,base=+d[k+'Base'],ext=d[k+'Ext']||'.jpg',split=+d[k+'Split']||N;
  var ctx=canvas.getContext('2d',{alpha:false});
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FOCAL_X=mob?.5:.4,SCRUB_END=.7; // frames play across the first 70% of the pin, then hold on the last frame
  var frames=new Array(N),lastW=innerWidth,cur=0,target=0,drawn=-1,raf=0,W=0,H=0,ready=false;
  function url(i){return 'assets'+(base+(i<split?0:1))+'/f-'+String(i+1).padStart(3,'0')+ext;} // frames are split across two folders (GitHub upload limit)
  function best(i){ // nearest loaded frame so scrubbing never goes blank while loading
    if(frames[i])return i;
    for(var dd=1;dd<N;dd++){if(i-dd>=0&&frames[i-dd])return i-dd;if(i+dd<N&&frames[i+dd])return i+dd;}
    return -1;
  }
  function size(){
    var dpr=Math.min(window.devicePixelRatio||1,mob?1.5:2),r=canvas.getBoundingClientRect();
    W=Math.max(1,Math.round(r.width*dpr));H=Math.max(1,Math.round(r.height*dpr));
    canvas.width=W;canvas.height=H;drawn=-1;draw(true);
  }
  function draw(force){
    var i=best(Math.round(cur));if(i<0||(!force&&i===drawn))return;
    var img=frames[i],iw=img.naturalWidth,ih=img.naturalHeight;
    var s=Math.max(W/iw,H/ih),dw=iw*s,dh=ih*s;
    ctx.drawImage(img,-(dw-W)*FOCAL_X,-(dh-H)*.5,dw,dh);drawn=i;
    if(!ready){ready=true;media.classList.add('is-ready');}
  }
  function tick(){
    raf=0;
    var p=parseFloat(hero.style.getPropertyValue('--hero-p'))||0;
    target=reduce?(N-1)*.5:Math.min(1,p/SCRUB_END)*(N-1);
    cur+=(target-cur)*(reduce?1:(mob?.25:.18));
    if(Math.abs(target-cur)<.01)cur=target;
    draw(false);
    if(cur!==target)raf=requestAnimationFrame(tick);
  }
  function kick(){if(!raf)raf=requestAnimationFrame(tick);}
  window.addEventListener('scroll',kick,{passive:true});
  window.addEventListener('resize',function(){ // ignore mobile URL-bar height jitter; only real width changes redraw
    if(mob&&Math.abs(innerWidth-lastW)<2)return;lastW=innerWidth;size();},{passive:true});
  function load(i,done){
    var im=new Image();im.decoding='async';
    im.onload=function(){frames[i]=im;if(i===0||!ready)draw(true);done&&done();};
    im.onerror=function(){done&&done();};
    im.src=url(i);
  }
  size();
  load(0,function(){
    var next=1,active=0,MAX=mob?4:6;
    (function pump(){
      while(active<MAX&&next<N){active++;load(next++,function(){active--;kick();pump();});}
    })();
  });
  kick();
})();
