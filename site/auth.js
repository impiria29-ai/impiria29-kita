(()=>{
 const $=s=>document.querySelector(s), gate=$('#authGate'), message=$('#authMessage');
 const client=window.supabase?.createClient?.(window.SUPABASE_CONFIG?.url||'',window.SUPABASE_CONFIG?.publishableKey||'');
 if(!client){message.textContent='Sambungan login tidak dapat dimulakan. Muat semula halaman dan semak sambungan internet.';message.classList.add('error');return}
 window.COMMUNITY_SUPABASE=client;
 const signupHouse=$('#authSignupForm [name="house_number"]');
 for(let n=1;n<=43;n++){let option=document.createElement('option');option.value=String(n);option.textContent=`Rumah ${String(n).padStart(2,'0')}`;signupHouse.append(option)}
 function say(text,error=false){message.textContent=text;message.classList.toggle('error',error)}
 function switchForm(which){$('#authLoginForm').classList.toggle('hidden',which!=='login');$('#authSignupForm').classList.toggle('hidden',which!=='signup');say('')}
 async function addPollTallies(snapshot){
   for(const poll of (snapshot?.polls||[])){let {data,error}=await client.rpc('get_poll_tallies',{p_poll_id:poll.id});if(!error&&Array.isArray(data)){poll.remoteCounts=poll.options.map((_,i)=>Number(data.find(x=>Number(x.option_index)===i)?.vote_count||0));poll.remoteChoice=data.find(x=>x.my_choice!==null&&x.my_choice!==undefined)?.my_choice??null}}
   return snapshot;
 }
 window.refreshCommunitySnapshot=async()=>{let {data:snapshot,error}=await client.rpc('get_app_snapshot');if(error)throw error;await addPollTallies(snapshot);window.activateCommunitySession({client,session:window.COMMUNITY_SESSION.session,profile:window.COMMUNITY_SESSION.profile,snapshot});return snapshot};
 async function activate(session){
   say('Memeriksa kelulusan akaun…');
   let {data:profile,error}=await client.from('profiles').select('user_id,full_name,phone,house_number,requested_house_number,role,approval_status').eq('user_id',session.user.id).single();
   if(error||!profile){say('Rekod akaun belum tersedia. Pastikan skrip database sudah dipasang di Supabase.',true);$('#authSignOut').classList.remove('hidden');return}
   if(profile.approval_status!=='approved'||!profile.house_number){say('Permohonan diterima. AJK perlu meluluskan akaun dan pautkan nombor rumah sebelum akses dibuka.',false);$('#authSignOut').classList.remove('hidden');return}
   say('Memuatkan data komuniti…');
   let result=await client.rpc('get_app_snapshot');
   if(result.error){say('Database belum disediakan atau polisi akses belum aktif. Minta admin semak setup Supabase.',true);$('#authSignOut').classList.remove('hidden');return}
   let snapshot=result.data;
   if(!snapshot&&['admin','ajk'].includes(profile.role)){
     snapshot=window.createEmptyCommunityData();
     let saved=await client.rpc('save_app_snapshot',{p_data:snapshot});
     if(saved.error){say('Tidak dapat menyediakan data awal komuniti: '+saved.error.message,true);$('#authSignOut').classList.remove('hidden');return}
   }
   if(!snapshot){say('AJK belum menyediakan data komuniti. Hubungi admin taman.',true);$('#authSignOut').classList.remove('hidden');return}
   await addPollTallies(snapshot);
   window.activateCommunitySession({client,session,profile,snapshot});
   document.documentElement.classList.remove('auth-configured');
   $('#logoutButton').classList.remove('hidden');$('#logoutButton').onclick=()=>client.auth.signOut().then(()=>location.reload());
   gate.setAttribute('aria-hidden','true');
 }
 $('#authLoginForm').addEventListener('submit',async e=>{
   e.preventDefault();let f=new FormData(e.currentTarget);say('Sedang log masuk…');
   let {data,error}=await client.auth.signInWithPassword({email:String(f.get('email')).trim(),password:String(f.get('password'))});
   if(error){say('E-mel atau kata laluan tidak betul, atau pengesahan e-mel belum selesai.',true);return}
   await activate(data.session);
 });
 $('#authSignupForm').addEventListener('submit',async e=>{
   e.preventDefault();let f=new FormData(e.currentTarget),phone=String(f.get('phone')).trim();
   if(!phone){say('Nombor telefon wajib diisi.',true);return}
   say('Menghantar permohonan…');
   let {data,error}=await client.auth.signUp({email:String(f.get('email')).trim(),password:String(f.get('password')),options:{data:{full_name:String(f.get('full_name')).trim(),phone,house_number:String(f.get('house_number'))}}});
   if(error){say(error.message,true);return}
   if(data.session) await activate(data.session); else say('Permohonan diterima. Semak e-mel untuk pengesahan, kemudian tunggu kelulusan AJK.');
 });
 document.addEventListener('click',e=>{let b=e.target.closest('[data-auth-switch]');if(b)switchForm(b.dataset.authSwitch)});
 $('#authSignOut').addEventListener('click',async()=>{await client.auth.signOut();location.reload()});
 client.auth.getSession().then(({data,error})=>{if(error)say('Tidak dapat menyambung ke Supabase: '+error.message,true);else if(data.session)activate(data.session)});
 client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'&&document.documentElement.classList.contains('auth-configured'))say('Anda telah log keluar.')});
})();
