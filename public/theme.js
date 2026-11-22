(()=>{
 const media=window.matchMedia('(prefers-color-scheme: dark)');let preference;
 try{preference=localStorage.getItem('forex-panel-theme');}catch{}
 if(!['dark','light'].includes(preference))preference=null;
 function apply(theme){document.documentElement.dataset.theme=theme;const b=document.getElementById('themeToggle');if(b){b.setAttribute('aria-pressed',String(theme==='dark'));b.textContent=theme==='dark'?'☀ Светлая тема':'☾ Тёмная тема';}}
 apply(preference||(media.matches?'dark':'light'));
 document.addEventListener('DOMContentLoaded',()=>{apply(preference||(media.matches?'dark':'light'));document.getElementById('themeToggle').onclick=()=>{preference=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('forex-panel-theme',preference);}catch{}apply(preference);};});
 media.addEventListener('change',()=>{if(!preference)apply(media.matches?'dark':'light');});
})();
