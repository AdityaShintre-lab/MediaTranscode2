// GLSL for the MediaTranscode cosmos film. One continuous shot:
// spark -> star -> supernova -> scattered debris -> galaxy -> dive to the core.

export const COMMON = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler3D;
uniform sampler3D uNoise;   // tileable RGBA gradient noise, 16 cells per tile
uniform float uT;           // film time, seconds
#define PI 3.14159265
#define sat(x) clamp(x,0.,1.)
float sq(float x){return x*x;}
vec4 nz(vec3 p){return textureLod(uNoise,p*.0625,0.);}
const mat3 ROT=mat3(0.,.8,.6,-.8,.36,-.48,-.6,-.48,.64);
float fbm3(vec3 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*nz(p).x;p=ROT*p*2.03+3.1;a*=.5;}return s;}
float fbm5(vec3 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*nz(p).y;p=ROT*p*2.04+5.7;a*=.5;}return s;}
float ridge4(vec3 p){float s=0.,a=.55,w=1.;for(int i=0;i<4;i++){float n=1.-abs(nz(p).z)*2.1;n=max(n,0.);n*=n;s+=a*n*w;w=sat(n*1.6);p=ROT*p*2.07+1.9;a*=.5;}return s;}
float smoother(float x){x=sat(x);return x*x*x*(x*(x*6.-15.)+10.);}
`;

export const FSQ = `#version 300 es
out vec2 vUv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;

// ---------------------------------------------------------------- volumetrics
export const VOLUME = COMMON + `
in vec2 vUv; out vec4 o;
uniform vec3 uCam; uniform mat3 uBasis; uniform float uTan, uAspect; uniform vec2 uJit; uniform float uSeed;
uniform float uStarR, uStarI, uStarHeat, uInstab;   // star
uniform float uTau, uShell, uEjecta, uCore;         // blast
uniform float uGal, uGalR, uGalSpin, uChaos;        // galaxy
uniform float uNeb, uDark;
uniform float uLight[64];                           // light curve for the echo, 1/8 s steps back in time
float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}

float lightAt(float r){float f=r/26.*8.;int i=int(f);if(i>62)return uLight[63];return mix(uLight[i],uLight[i+1],fract(f));}

// distant sky: faint coloured haze, no parallax
vec3 sky(vec3 d){
  vec3 q=d*3.1+vec3(4.,1.7,9.);
  vec3 w=nz(q*1.1).xyz;
  float a=fbm5(q+w*.9), b=fbm5(q*1.7+w*.5+11.);
  float band=exp(-sq((d.y*.86+d.x*.42+.10*a)/.34));
  float cl=sat(a*1.5+.34)*band;
  float dk=sat(ridge4(q*1.6+w)*1.15-.1);
  vec3 c=vec3(.0015,.0024,.0075);
  c+=vec3(.010,.013,.042)*cl*(1.-.75*dk);
  c+=vec3(.030,.010,.052)*sat(b*1.6+.05)*band*(1.-.6*dk);
  c+=vec3(.004,.012,.030)*sat(-b*1.7)*(.4+band);
  return c;
}

// nebula walls around the camera corridor, lit by the star (with a travelling light echo)
float wallDensity(vec3 p){
  float rad=length(p.xy*vec2(.72,1.));
  vec3 q=p*.085+vec3(2.3,7.1,0.);
  vec3 w=nz(q*.8).xyz;
  q+=w*.75;
  float mask=smoothstep(3.5,17.,rad+w.x*9.)*smoothstep(58.,26.,rad);
  mask*=smoothstep(-46.,-20.,p.z)*smoothstep(52.,34.,p.z);
  if(mask<.003)return 0.;
  float n=fbm5(q*1.35);
  float rg=ridge4(q*2.3+w*.5);
  float dn=sat(n*2.0+.04-.18*(1.-mask)+(rg-.42)*.34);
  return dn*dn*(.55+.9*rg)*mask;
}

// expanding ejecta, in homologous coordinates so structure stretches with the blast
vec4 ejecta(vec3 p){
  vec3 q=p/uShell; float r0=length(q); if(r0>1.65)return vec4(0.);
  vec3 d=q/max(r0,1e-4);
  vec3 w=nz(q*2.1+3.).xyz;
  vec3 qq=q+.20*w+.05*nz(q*7.+9.).xyz;
  float r=length(qq);
  float lump=fbm3(d*2.4+7.);
  float rs=.80+.46*lump;
  float th=.085+.07*sat(.5+lump);
  float shell=exp(-sq((r-rs)/th));
  float rid=ridge4(qq*3.6+d*2.);
  float fil=pow(sat(rid*1.24),4.2)*1.25;
  float finger=pow(sat(ridge4(d*5.2+vec3(r*1.1)+w*.3)*1.15),3.);
  float inner=exp(-r*r*5.5);
  float fog=sat(fbm5(qq*3.+2.)*1.6+.30);
  float voids=smoothstep(-.20,.22,fbm3(q*1.55+w*.35+20.)+.06);
  float spur=exp(-sq(max(r-rs,0.)/.26))*step(rs,r)*finger;
  float dens=shell*(.10+1.75*fil)+spur*.62+inner*fog*.16+fog*fil*.34*exp(-sq(r/.95));
  dens*=smoothstep(1.60,.95,r0)*mix(1.,.06+1.35*voids,smoothstep(.4,1.8,uTau));
  float heat=exp(-uTau*.62);
  vec3 gold=vec3(1.,.60,.22), white=vec3(1.,.88,.72), orchid=vec3(.74,.22,.88), violet=vec3(.36,.18,1.), blue=vec3(.13,.36,1.);
  float k=r+.22*w.y;
  vec3 c=mix(gold,orchid,smoothstep(.30,.70,k));
  c=mix(c,violet,smoothstep(.58,.92,k));
  c=mix(c,blue,smoothstep(.86,1.22,k));
  c=mix(c,white,sat(heat*heat*1.1*exp(-r*.9)));
  c+=gold*sat(fil*1.35-.50)*(.75+heat)*smoothstep(1.25,.45,k)*1.7;
  float lit=(.30+1.0*exp(-r*1.5))*(1.+2.4*heat);
  return vec4(c*dens*lit, dens);
}

// spiral disc: arms in a log-spiral frame, gas emission + dust extinction
vec4 galaxy(vec3 p){
  vec3 q=p/uGalR; float r=length(q.xz);
  float hgt=.013+.026*r+.20*uChaos;
  float vert=exp(-sq(q.y/hgt));
  vec3 bq=q*vec3(1.,1.55,1.); float br=length(bq);
  float bulge=exp(-br*15.)*.34+exp(-br*38.)*1.6;
  float lid=smoothstep(.17+.30*uChaos,.05,abs(q.y));
  vec4 res=vec4(vec3(1.,.70,.40)*bulge*1.15,0.);
  res.rgb+=vec3(1.,.50,.34)*exp(-br*6.2)*.020;
  res.rgb*=lid;
  if(r>1.25||vert<.004)return res;
  float th=atan(q.z,q.x);
  float lr=log(max(r,.02)/.055);
  float ph=th-lr*2.75+uGalSpin;
  vec3 sp=vec3(cos(ph)*2.1,sin(ph)*2.1,lr*1.15);
  vec3 w=nz(sp*1.3+vec3(0.,0.,q.y*26.)).xyz;
  float warp=.50*w.x+.26*fbm3(sp*2.6+4.)+uChaos*2.4*fbm3(q*4.+2.);
  float a0=max(.5+.5*cos(2.*ph+warp*1.5),0.);
  float a1=max(.5+.5*cos(4.*ph+1.1+warp*2.1),0.);
  float arm=pow(a0,2.6)+.26*pow(a1,3.)*smoothstep(.18,.5,r);
  float disc=exp(-r*2.9)*smoothstep(1.2,.6,r);
  vec3 fp=vec3(cos(ph)*5.0,sin(ph)*5.0,lr*9.+q.y*9.);
  float thc=th+uGalSpin-.35*lr; vec3 ip=vec3(r*cos(thc),r*sin(thc),q.y*4.5)*13.;
  float det=sat(fbm5(ip+w*1.6)*1.5+fbm3(fp+w*1.1)*.9+.40);
  float fil=mix(ridge4(fp*.8+w*.8),ridge4(ip*.95+w*1.3),.62);
  float lanes=pow(max(.5+.5*cos(2.*ph+.95+warp*1.5),0.),3.2);
  float dust=(lanes*.95+.38*arm)*pow(sat(fil*1.18),2.)*smoothstep(.03,.11,r)*smoothstep(1.05,.55,r);
  dust+=.55*sat(fbm5(fp*.9+8.)*2.-.15)*exp(-r*2.)*smoothstep(.05,.16,r);
  float gas=disc*(.16+1.65*arm*det*det);
  vec3 gold=vec3(1.,.68,.38), pale=vec3(.80,.76,1.), violet=vec3(.50,.33,1.), blue=vec3(.22,.45,1.), hii=vec3(1.,.24,.62);
  vec3 c=mix(gold,pale,smoothstep(.04,.22,r));
  c=mix(c,violet,smoothstep(.16,.44,r+.1*w.y)*.82);
  c=mix(c,blue,smoothstep(.36,.86,r+.16*w.z)*.80);
  float knots=pow(sat(nz(ip*3.1+w*.8+vec3(3.,1.,6.)).w*2.0-.26),2.)*arm*smoothstep(.14,.3,r)*smoothstep(1.,.55,r);
  vec3 em=c*gas*.98+hii*knots*disc*3.0;
  em*=vert/(hgt*26.);
  float ext=dust*vert*smoothstep(0.,.5,uGal)/(hgt*9.);
  res.rgb+=em; res.a+=ext;
  return res;
}

vec2 sph(vec3 ro,vec3 rd,float R){float b=dot(ro,rd),c=dot(ro,ro)-R*R,h=b*b-c;if(h<0.)return vec2(1.,-1.);h=sqrt(h);return vec2(-b-h,-b+h);}

void main(){
  vec2 ndc=(vUv*2.-1.)+uJit;
  vec3 rd=normalize(uBasis*vec3(ndc.x*uTan*uAspect,ndc.y*uTan,-1.));
  vec3 ro=uCam;
  float jit=hash(gl_FragCoord.xy+uSeed*17.3);
  vec3 col=vec3(0.); float T=1.;
  vec3 bg=sky(rd)*(1.-.75*uDark);
  float b=-dot(ro,rd); vec3 cp=ro+rd*b; float imp=length(cp); if(b<0.)imp=1e3;
  vec3 up=normalize(cp+1e-5);

  // --- the star, its corona and halo, drawn as light at the origin ---
  vec3 starC=vec3(0.); float hitT=1e9;
  if(uStarI>0.){
    vec2 h=sph(ro,rd,uStarR);
    vec3 warm=mix(vec3(1.,.70,.36),vec3(.66,.56,1.),uStarHeat);
    if(h.y>0.&&h.x>0.){
      vec3 n=normalize(ro+rd*h.x);
      float mu=sat(dot(n,-rd)); float lod=smoothstep(.05,.55,mu);
      vec3 sp=n*3.4+vec3(0.,0.,uT*.42);
      vec3 sw=nz(sp*.8).xyz;
      float g=mix(fbm3(sp*1.1+sw*.8),fbm5(sp*1.6+sw*1.0),lod);
      float plate=sat(.52+g*1.25+.35*nz(n*9.+sw*.6+uT*.2).w*lod);
      float cr=pow(sat(ridge4(sp*.78+sw*.45+uT*.07)*1.16),7.)*lod;
      float lim=.22+.78*pow(mu,.75);
      vec3 calm=mix(vec3(1.,.40,.10),vec3(1.,.82,.52),plate)*(1.05+.55*plate);
      vec3 rage=mix(vec3(.42,.20,.86),vec3(.98,.84,1.),smoothstep(.15,.95,plate))*(.75+.8*plate);
      vec3 sc=mix(calm,rage,uStarHeat*.88);
      sc+=mix(vec3(1.,.72,.40),vec3(1.,.90,1.),uStarHeat)*cr*(.10+4.2*uInstab*uInstab);
      sc+=vec3(.75,.80,1.)*uDark*1.9;
      starC+=sc*lim*(.78+.07*uStarI);
      starC+=mix(vec3(1.,.55,.22),vec3(.62,.44,1.),uStarHeat)*pow(1.-mu,2.2)*.62;
      hitT=h.x;
    }
    float e=max(imp-uStarR,0.);
    vec3 dirS=up; float dist=length(ro);
    float ray=.5+.9*fbm3(dirS*4.2+vec3(0.,0.,uT*.22))+.6*fbm3(dirS*11.+vec3(0.,uT*.3,0.));
    ray=max(ray,0.); float str=pow(sat(ray),2.2);
    float cor=exp(-e/(uStarR*.50))*(.35+.9*ray)+exp(-e/(uStarR*(1.5+1.2*uInstab)))*.34*str;
    float px=uTan*dist/540.;
    starC+=warm*uStarI*.21*cor*step(0.,b)*(hitT<1e8?.06:1.);
    float hw=max(uStarR,.0075*length(ro)); starC+=warm*uStarI*(.085*hw*hw/(imp*imp+hw*hw*.8)+.0075*hw/(imp+hw*2.))*step(0.,b)*(hitT<1e8?.2:1.);
    // photographic diffraction cross while the star is still a point
    float ang=uTan*length(ro); vec3 rx=uBasis[0],ry=uBasis[1]; vec2 sc2=vec2(dot(cp,rx),dot(cp,ry))/ang; float tiny=smoothstep(.12,.02,uStarR/ang);
    starC+=warm*uStarI*tiny*.30*(exp(-abs(sc2.x)*26.)*exp(-sq(sc2.y*420.))+exp(-abs(sc2.y)*26.)*exp(-sq(sc2.x*420.)))*step(0.,b);
  }
  // --- remnant core after the blast ---
  if(uCore>0.){
    float f=.30+.2*uTau;
    starC+=vec3(1.,.90,.80)*uCore*(1.2*exp(-sq(imp/f))+.16*f*f/(imp*imp+f*f*.5)+.020/(imp*.35+.5));
  }
  // --- shock front: a thin limb-brightened sphere racing outward ---
  if(uTau>0.&&uTau<2.6){
    float R=1.2+17.*uTau*pow(uTau+.04,-.12);
    vec3 un=up*(1.+.0*R);
    float wv=fbm3(un*3.1+3.)*.16+fbm3(un*8.+uTau)*.05;
    float Rn=R*(1.+wv); float s=sat(imp/Rn);
    float nse=pow(sat(.45+1.5*fbm5(un*7.+vec3(uTau*.6))),1.6);
    float edge=exp(-sq((imp-Rn)/(Rn*.022+.05)))+.55*exp(-sq(max(Rn-imp,0.)/(Rn*.20)))*step(imp,Rn);
    starC+=mix(vec3(.85,.80,1.),vec3(.46,.26,1.),sat(uTau*1.4))*edge*nse*step(0.,b)*(3.0*exp(-uTau*2.0))*smoothstep(0.,.10,uTau);
    float spoke=pow(sat(.35+1.3*fbm3(up*9.+2.)),3.)+.5*pow(sat(.3+1.4*fbm5(up*21.)),3.);
    starC+=mix(vec3(1.,.80,.62),vec3(.52,.32,1.),sat(imp/(2.+9.*uTau)))*spoke*exp(-imp/(1.6+13.*uTau))*step(0.,b)*2.6*exp(-uTau*2.2);
  }

  // --- march: wall segment A, ejecta, wall segment B ---
  vec2 ej=vec2(1.,-1.);
  if(uEjecta>.012){ej=sph(ro,rd,uShell*1.64);ej.x=max(ej.x,.05);}
  bool hasEj=ej.y>ej.x;
  float far=86.;
  float tStar=max(b,0.);
  bool starDone=false;

  if(uNeb>.001){
    const int NW=38; float tp=.6;
    float end=hasEj?min(ej.x,far):far;
    for(int i=0;i<NW;i++){
      float u=(float(i)+jit)/float(NW); float t=.6+(far-.6)*u*u*.55+(far-.6)*u*.45;
      float ds=t-tp; tp=t;
      if(t>tStar&&!starDone&&uStarI+uCore>0.){col+=starC*T;starDone=true;}
      vec3 p=ro+rd*t; float dn=wallDensity(p);
      if(dn>.002){
        float r=length(p); vec3 ld=-p/max(r,1e-3);
        float sh=exp(-5.0*wallDensity(p+ld*2.7));
        float L=lightAt(r)/(1.+r*r*.022);
        float ph=.55+.9*pow(sat(.5+.5*dot(rd,ld)),3.);
        float hue=sat(.5+1.4*nz(p*.05+3.).w);
        vec3 self=mix(vec3(.012,.018,.060),vec3(.046,.014,.074),hue);
        vec3 lit=mix(vec3(1.,.56,.26),vec3(.46,.34,1.),sat(.15+.95*hue));
        vec3 em=self*(.40+.85*sh)+lit*min(L,20.)*sh*ph*.050;
        float a=dn*ds*.36*uNeb;
        col+=T*em*dn*ds*1.35*uNeb; T*=exp(-a);
      }
      if(T<.02)break;
    }
  }
  if(!starDone&&hasEj==false){col+=starC*T;starDone=true;}

  if(hasEj){
    const int NE=76; float len=ej.y-ej.x; float ds=len/float(NE);
    bool coreDone=starDone;
    for(int i=0;i<NE;i++){
      float t=ej.x+(float(i)+jit)*ds;
      if(t>tStar&&!coreDone){col+=starC*T;coreDone=true;}
      vec4 e=ejecta(ro+rd*t);
      if(e.a>.001){
        float k=ds/uShell;
        col+=T*e.rgb*k*uEjecta*1.25;
        T*=exp(-e.a*k*1.9*min(uEjecta,1.));
      }
      if(T<.015)break;
    }
    if(!coreDone)col+=starC*T;
  }

  if(uGal>.001){
    float R=uGalR*1.25;
    vec2 gs=sph(ro,rd,R);
    if(gs.y>0.){
      float t0=max(gs.x,.02), t1=gs.y;
      float H=uGalR*(.17+.30*uChaos);
      if(abs(rd.y)>1e-4){float a=(-H-ro.y)/rd.y,c=(H-ro.y)/rd.y;t0=max(t0,min(a,c));t1=min(t1,max(a,c));}
      if(t1>t0){
        int NG=int(mix(112.,56.,smoothstep(.05,.5,uChaos))); float len=t1-t0; vec3 acc=vec3(0.); float Tg=1.; float tp=t0;
        for(int i=0;i<NG;i++){
          float u=(float(i)+jit)/float(NG);
          float t=t0+len*mix(u,u*u,.45); float ds=t-tp; tp=t;
          vec4 g=galaxy(ro+rd*t);
          float k=ds/uGalR;
          acc+=Tg*g.rgb*k*34.; Tg*=exp(-g.a*k*30.);
          if(Tg<.01)break;
        }
        col+=T*acc*uGal; T*=mix(1.,Tg,uGal);
      }
    }
  }
  col+=bg*T;
  o=vec4(col,T);
}`;

// ---------------------------------------------------------------- particles
const PHEAD = COMMON + `
uniform mat4 uView,uProj; uniform float uPx,uAperture,uFocus,uTau; uniform vec2 uJit; uniform float uGain;
out vec4 vCol; out float vSoft;
uvec4 pcg4(uvec4 v){v=v*1664525u+1013904223u;v.x+=v.y*v.w;v.y+=v.z*v.x;v.z+=v.x*v.y;v.w+=v.y*v.z;v^=v>>16u;v.x+=v.y*v.w;v.y+=v.z*v.x;v.z+=v.x*v.y;v.w+=v.y*v.z;return v;}
vec4 rnd(uint id,uint k){return vec4(pcg4(uvec4(id,k*7919u+13u,id*2654435761u+k,(id>>5u)^(k*2246822507u))))/4294967295.;}
void emit(vec3 p,float size,vec3 c,float flux,float maxPx){
  vec4 mv=uView*vec4(p,1.); float d=-mv.z;
  if(d<.12){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;vCol=vec4(0.);vSoft=0.;return;}
  float s=size*uPx/d;
  float coc=min(uAperture*abs(1./d-1./uFocus)*uPx*.02,46.);
  float sz=sqrt(s*s+1.15*1.15+coc*coc); sz=min(sz,maxPx);
  gl_Position=uProj*mv; gl_Position.xy+=uJit*gl_Position.w;
  gl_PointSize=sz*3.2;
  float e=flux*min(s*s,400.)/(sz*sz)*smoothstep(.12,.9,d);
  vCol=vec4(c*e,1.); vSoft=sat(coc/(s+1.5));
}
vec3 bb(float t){ // cool->hot star tint
  return mix(mix(vec3(1.,.62,.36),vec3(1.,.90,.78),sat(t*2.)),vec3(.62,.74,1.),sat(t*2.-1.));}
`;

export const EJECTA_VS = PHEAD + `
uniform float uBlastR,uBlastFade,uGalR,uGalSpin,uForm,uGalGain;
void main(){
  uint id=uint(gl_VertexID);
  vec4 a=rnd(id,0u),b=rnd(id,1u),c=rnd(id,2u),e=rnd(id,3u);
  float cz=a.x*2.-1.,ph=a.y*2.*PI,s=sqrt(max(1.-cz*cz,0.));
  vec3 d=vec3(s*cos(ph),cz,s*sin(ph));
  float lump=fbm3(d*2.4+7.);
  float v; float hot=0.;
  if(a.z<.52) v=mix(.80,1.0,b.x*b.x)*(1.+.60*lump);
  else if(a.z<.86) v=pow(b.x,.62)*.86*(1.+.35*lump);
  else {v=.95+1.75*b.x*b.x*(1.+.5*lump);hot=1.;}
  vec3 q=d*v;
  vec3 disp=nz(q*2.1+3.).xyz*.17+nz(q*5.2+1.).xyz*.085+nz(q*11.+6.).xyz*.034;
  float grow=1.-exp(-uTau*.9);
  vec3 p=(q+disp*(.25+.9*grow))*uBlastR;

  float fm=pow(sat(ridge4(q*2.6+disp*1.5+d*2.)*1.22),4.2);
  fm*=mix(1.,.04+1.5*smoothstep(-.20,.22,fbm3(q*1.55+disp*1.5+20.)+.06),smoothstep(.4,1.8,uTau));
  // colour while it is debris
  float heat=exp(-uTau*.70);
  vec3 gold=vec3(1.,.64,.26),white=vec3(1.,.92,.82),orchid=vec3(.80,.32,.92),violet=vec3(.44,.28,1.),blue=vec3(.24,.48,1.);
  vec3 ce=mix(gold,orchid,smoothstep(.2,.6,v+.15*(c.x-.5)));
  ce=mix(ce,violet,smoothstep(.5,.85,v+.2*(c.y-.5))); ce=mix(ce,blue,smoothstep(.85,1.4,v+.3*(c.z-.5)));
  ce=mix(ce,gold*1.5,step(.88,c.w)); ce=mix(ce,gold*1.3,sat(fm*1.1-.35)*smoothstep(1.,.45,v)); ce=mix(ce,white,sat(heat*heat*1.1));
  float big=pow(e.x,18.);
  float sE=.017*(.55+1.1*e.y+5.2*big);
  float fE=(.55+3.1*heat)*(.07+4.4*fm)*(.35+1.1*e.z)*mix(1.,1.4,hot)*uBlastFade*smoothstep(0.,10.5,uBlastR);

  // galaxy seat
  float rg,yg,th; vec3 cg; float sg,fg;
  if(c.x<.17){ // bulge
    float rr=.055*uGalR*(-log(max(1.-b.y,.002)))*.62; float z2=b.z*2.-1.,p2=b.w*2.*PI,s2=sqrt(1.-z2*z2);
    vec3 bp=rr*vec3(s2*cos(p2),z2*.62,s2*sin(p2)); rg=max(length(bp.xz),1e-3);yg=bp.y;th=atan(bp.z,bp.x);
    cg=mix(vec3(1.,.66,.34),vec3(1.,.88,.70),c.y); sg=.016; fg=.55;
  }else{
    float rd=.27; float x=-rd*log(1.-b.y*(1.-exp(-1.12/rd)));
    rg=max(x,.012);
    float lr=log(max(rg,.02)/.055);
    float g=(c.y+c.z+c.w-1.5);                          // ~gaussian
    float arm=floor(b.z*2.);
    bool inArm=c.x<.74;
    th=lr*2.75-uGalSpin+arm*PI+(inArm?g*(.42+.10/rg*.2):b.w*2.*PI);
    float wob=fbm3(vec3(cos(th)*2.,sin(th)*2.,lr)*1.1)*.22; th+=wob*(inArm?.8:.2);
    yg=uGalR*(e.w+e.z+e.y-1.5)*(.0075+.011*rg);
    float young=inArm?pow(e.x,2.):.08*e.x;
    cg=mix(vec3(1.,.78,.52),vec3(.78,.74,1.),smoothstep(.05,.30,rg));
    cg=mix(cg,vec3(.52,.40,1.),smoothstep(.2,.5,rg+.1*g)*.65);
    cg=mix(cg,vec3(.46,.66,1.),young*.85);
    float hii=step(.982,e.x)*step(.16,rg)*(inArm?1.:0.);
    cg=mix(cg,vec3(1.,.34,.66),hii);
    sg=.0125*(.6+.9*e.y+3.4*pow(e.x,20.)+1.4*hii); fg=mix(.55,1.0,young)+hii*.5;
    float ph2=th-lr*2.75+uGalSpin;
    float lane=pow(max(.5+.5*cos(2.*ph2+.95),0.),3.)*.72*smoothstep(.04,.14,rg);
    fg*=(1.-lane)*mix(.22,1.,smoothstep(.03,.26,rg));
    rg*=uGalR;
  }
  sg*=uGalR/14.;

  // spiral infall from debris to seat
  float tm=1.5*a.w+1.9*sat(rg/uGalR)+.25*e.w;
  float m=smoother((uForm-tm)/(3.1+1.3*e.z));
  float r0=length(p.xz),t0=atan(p.z,p.x);
  float ref=th+uGalSpin;                               // seat angle with rotation removed
  float dlt=mod(t0-ref+PI*2.,2.*PI)+PI*(.35+.9*(1.-sat(rg/uGalR)));
  float my=smoother((uForm-tm+.5)/3.0);
  float r=exp(mix(log(r0+.01),log(rg),m));
  float ang=t0-m*dlt-m*uGalSpin;
  // land exactly on the seat angle at m=1
  float endAng=t0-dlt; float resid=ref-endAng; resid-=2.*PI*floor(resid/(2.*PI)+.5);
  ang+=m*resid;
  float turb=m*(1.-m)*4.;
  vec3 pg=vec3(r*cos(ang),mix(p.y,yg,my),r*sin(ang));
  pg+=nz(pg*.22+uT*.04).xyz*turb*1.6;
  vec3 pos=mix(p,pg,smoothstep(0.,.02,m));
  vec3 cc=mix(ce,cg,smoothstep(.1,.9,m)); float sz=mix(sE,sg,m);
  float fl=mix(fE,fg*uGalGain,m);
  fl*=1.+turb*2.4;
  emit(pos,sz,cc,fl*uGain,56.);
}`;

export const INFALL_VS = PHEAD + `
uniform float uInfall,uInfallGain,uStarR2;
void main(){
  uint id=uint(gl_VertexID); vec4 a=rnd(id,10u),b=rnd(id,11u);
  float cz=(a.x*2.-1.),ph=a.y*2.*PI; cz*=abs(cz); float s=sqrt(1.-cz*cz);
  vec3 d=vec3(s*cos(ph),cz,s*sin(ph));
  float r0=2.6+7.5*pow(b.x,1.6);
  float k=smoother((uInfall-b.y*.35)/.65);
  float r=mix(r0,uStarR2*1.06,k); float sw=ph+(1.6+2./r0)*k*3.+.05*uT/r0;
  vec3 p=vec3(s*cos(sw)*r,cz*r,s*sin(sw)*r)+nz(d*r0*.55+uT*.05).xyz*1.5*(1.-k);
  float wisp=pow(sat(ridge4(d*2.2+r0*.16)*1.15),4.);
  vec3 c=mix(vec3(.55,.45,1.),vec3(1.,.82,.58),sat(1.-r/6.));
  emit(p,.013*(.5+1.2*b.z*b.z),c,uInfallGain*wisp*(1.2+10.*k*(1.-k))*smoothstep(1.,.9,k)*uGain,14.);
}`;

export const STARS_VS = PHEAD + `
uniform float uFieldGain; uniform vec3 uCam; uniform float uNear;
void main(){
  uint id=uint(gl_VertexID); vec4 a=rnd(id,20u),b=rnd(id,21u);
  if(a.w<.62){ // sky: infinitely far
    float cz=a.x*2.-1.,ph=a.y*2.*PI,s=sqrt(1.-cz*cz);
    vec3 d=vec3(s*cos(ph),cz,s*sin(ph));
    float band=exp(-sq((d.y*.86+d.x*.42)/.36));
    float keep=step(b.w,.22+.9*band);
    float mag=pow(b.x,38.);
    emit(uCam+d*300.,.20*(.5+2.1*mag),bb(b.y),keep*(.12+.5*pow(b.x,6.)+6.*mag)*uFieldGain*uGain,9.);
  }else{ // mid field: real parallax
    vec3 p=(vec3(a.xyz)-.5)*vec3(110.,80.,130.);
    float clear=smoothstep(2.2,6.,length(p.xy*vec2(.8,1.)));
    float mag=pow(b.x,16.);
    emit(p,.020*(.55+2.4*mag),bb(b.y),(.28+2.6*mag)*uFieldGain*uGain*clear*uNear*smoothstep(1.2,5.,length(p-uCam)),20.);
  }
}`;

export const POINT_FS = `#version 300 es
precision highp float; in vec4 vCol; in float vSoft; out vec4 o;
void main(){vec2 p=gl_PointCoord*2.-1.;float r2=dot(p,p);if(r2>1.)discard;
 float g=exp(-r2*4.6)-.01005; float disc=smoothstep(1.,.78,sqrt(r2))*(.30+.22*r2);
 o=vec4(vCol.rgb*mix(g,disc,vSoft*.85),0.);}`;

// ---------------------------------------------------------------- post
export const DOWN = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uFirst;
vec3 s(vec2 d){vec3 c=texture(uTex,vUv+d*uTexel).rgb; if(uFirst>.5)c=min(c,vec3(60.)); return c;}
float kw(vec3 c){return uFirst>.5?1./(1.+max(c.r,max(c.g,c.b))*.25):1.;}
void main(){
 vec3 a=s(vec2(-2,2)),b=s(vec2(0,2)),c=s(vec2(2,2)),d=s(vec2(-2,0)),e=s(vec2(0)),f=s(vec2(2,0)),g=s(vec2(-2,-2)),h=s(vec2(0,-2)),i=s(vec2(2,-2)),j=s(vec2(-1,1)),k=s(vec2(1,1)),l=s(vec2(-1,-1)),m=s(vec2(1,-1));
 vec3 g0=(j+k+l+m)*.25,g1=(a+b+d+e)*.25,g2=(b+c+e+f)*.25,g3=(d+e+g+h)*.25,g4=(e+f+h+i)*.25;
 float w0=.5*kw(g0),w1=.125*kw(g1),w2=.125*kw(g2),w3=.125*kw(g3),w4=.125*kw(g4);
 o=vec4((g0*w0+g1*w1+g2*w2+g3*w3+g4*w4)/(w0+w1+w2+w3+w4),1.);}`;

export const UP = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uK;
vec3 s(vec2 d){return texture(uTex,vUv+d*uTexel).rgb;}
void main(){vec3 c=s(vec2(0))*4.+(s(vec2(1,0))+s(vec2(-1,0))+s(vec2(0,1))+s(vec2(0,-1)))*2.+s(vec2(1,1))+s(vec2(-1,1))+s(vec2(1,-1))+s(vec2(-1,-1));o=vec4(c/16.*uK,1.);}`;

export const STREAK = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform float uW; uniform float uThr;
void main(){vec3 c=vec3(0.);float ws=0.;for(int i=-40;i<=40;i++){float f=float(i)/40.;float w=exp(-f*f*5.);vec3 s=texture(uTex,vUv+vec2(f*uW,0.)).rgb;s=max(s-uThr,0.);c+=s*w;ws+=w;}o=vec4(c/ws,1.);}`;

export const RAYS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uC; uniform float uThr;
float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
void main(){vec2 d=(uC-vUv)/72.;vec2 p=vUv+d*hash(gl_FragCoord.xy);vec3 c=vec3(0.);float w=1.;for(int i=0;i<72;i++){vec3 s=min(texture(uTex,p).rgb,vec3(14.));c+=max(s-uThr,0.)*w;w*=.972;p+=d;}o=vec4(c/72.,1.);}`;

export const FINAL = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uScene,uBloom,uStreak,uRays; uniform float uExp,uBloomK,uStreakK,uRaysK,uFlash,uShockR,uShockA,uAspect,uFade,uVig; uniform vec2 uC; uniform vec2 uRes; uniform float uFrame;
float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
vec3 tone(vec3 x){
  x=max(x,0.);
  vec3 y=1.-exp(-x*1.02);
  float l=dot(x,vec3(.2126,.7152,.0722)); float w=smoothstep(1.2,9.,l);
  y=mix(y,vec3(1.,.985,.97)*(1.-exp(-l*1.1)),w*.72);
  return y;
}
void main(){
  vec2 uv=vUv; vec2 cd=uv-uC; cd.x*=uAspect; float rr=length(cd); vec2 dir=cd/max(rr,1e-4); dir.x/=uAspect;
  if(uShockA>.001){float g=exp(-pow((rr-uShockR)/(.05+.09*uShockR),2.));uv-=dir*g*uShockA*.07;}
  vec2 q=uv-.5; float e=dot(q,q);
  vec2 ca=q*e*.0035;
  vec3 c=vec3(texture(uScene,uv-ca).r,texture(uScene,uv).g,texture(uScene,uv+ca).b);
  vec3 bl=vec3(texture(uBloom,uv-ca*2.).r,texture(uBloom,uv).g,texture(uBloom,uv+ca*2.).b);
  c=c+bl*uBloomK;
  c+=texture(uStreak,uv).rgb*uStreakK*vec3(.62,.60,1.);
  c+=texture(uRays,uv).rgb*uRaysK;
  c+=uFlash*(vec3(1.,.95,.90)*exp(-rr*rr*5.)*6.+vec3(1.,.62,.36)*exp(-rr*rr*2.2)*1.5+vec3(.36,.18,1.)*exp(-rr*1.15)*1.35);
  c*=uExp;
  c=tone(c);
  c=mix(c,c*c*(3.-2.*c),.22);                         // soft contrast
  float lum=dot(c,vec3(.2126,.7152,.0722));
  c=mix(vec3(lum),c,1.10);                             // a touch more chroma
  c+=vec3(.0035,.0045,.0135)*(1.-lum);                 // midnight black point
  float v=1.-uVig*smoothstep(.22,1.15,length((vUv-.5)*vec2(1.32,1.12)));
  c*=v*uFade;
  float n=hash(gl_FragCoord.xy)+hash(gl_FragCoord.xy+71.7)-1.;
  o=vec4(pow(max(c,0.),vec3(1./1.06))+n*1.25/255.,1.);
}`;

export const COPY = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform float uK; void main(){o=texture(uTex,vUv)*uK;}`;
