(()=>{
 const $=s=>document.querySelector(s), gate=$('#authGate'), message=$('#authMessage');
 const client=window.supabase?.createClient?.(window.SUPABASE_CONFIG?.url||'',window.SUPABASE_CONFIG?.publishableKey||'');
 if(!client){message.textContent='Sambungan login tidak dapat dimulakan. Muat semula halaman dan semak sambungan internet.';message.classList.add('error');return}
 window.COMMUNITY_SUPABASE=client;
 const signupHouse=$('#authSignupForm [name="house_number"]');
 for(let n=1;n<=43;n++){let option=document.createElement('option');option.value=String(n);option.textContent=`Rumah ${String(n).padStart(2,'0')}`;signupHouse.append(option)}
 function say(text,error=false){message.textContent=text;message.classList.toggle('error',error)}
 const callbackErrorParams=new URLSearchParams(window.location.hash.replace(/^#/,'')||'');
 if(callbackErrorParams.get('error_code')==='otp_expired'||callbackErrorParams.get('error')==='access_denied')say('Pautan lama tidak sah. Anda boleh log masuk selepas akaun diluluskan oleh AJK atau admin.',true)
 function switchForm(which){$('#authLoginForm').classList.toggle('hidden',which!=='login');$('#authSignupForm').classList.toggle('hidden',which!=='signup');$('#authRequestSuccess').classList.add('hidden');$('#authTitle').textContent='Impiria29 Kita';$('#authIntro').textContent='Log masuk untuk melihat ruang komuniti penduduk.';message.classList.remove('hidden');say('');history.replaceState(null,'',location.pathname+location.search)}
 function showRequestSubmitted(emailConfirmationStillOn){$('#authLoginForm').classList.add('hidden');$('#authSignupForm').classList.add('hidden');$('#authRequestSuccess').classList.remove('hidden');message.classList.add('hidden');$('#authSignOut').classList.add('hidden');$('#authTitle').textContent='Permohonan dihantar';$('#authIntro').textContent='Terima kasih kerana mendaftar akses penduduk.';$('#requestSuccessCopy').textContent=emailConfirmationStillOn?'Permohonan direkodkan, tetapi tetapan Supabase masih meminta pengesahan e-mel. Admin perlu mematikan Confirm email supaya pengguna tidak menerima e-mel dan boleh log masuk selepas kelulusan.':'AJK atau admin akan menyemak permohonan anda. Tiada e-mel pengesahan dihantar. Anda boleh log masuk selepas akaun diluluskan.';history.replaceState(null,'',location.pathname+location.search+'#permohonan-dihantar')}
 async function addPollTallies(snapshot){
   for(const poll of (snapshot?.polls||[])){let {data,error}=await client.rpc('get_poll_tallies',{p_poll_id:poll.id});if(!error&&Array.isArray(data)){poll.remoteCounts=poll.options.map((_,i)=>Number(data.find(x=>Number(x.option_index)===i)?.vote_count||0));poll.remoteChoice=data.find(x=>x.my_choice!==null&&x.my_choice!==undefined)?.my_choice??null}}
   return snapshot;
 }
 async function addEventAttendance(snapshot){window.COMMUNITY_EVENT_ATTENDANCE={};let events=Array.isArray(snapshot?.events)?snapshot.events:[],ids=events.map(event=>String(event.id||'')).filter(Boolean);if(!ids.length)return snapshot;try{let {data,error}=await client.rpc('get_event_attendance',{p_event_ids:ids});if(!error&&Array.isArray(data))for(const item of data)window.COMMUNITY_EVENT_ATTENDANCE[String(item.event_id)]={attendee_count:Number(item.attendee_count||0),attending:Boolean(item.attending)}}catch(error){console.warn('Ringkasan kehadiran acara belum tersedia.',error)}return snapshot}
 async function addPublicBirthdays(snapshot){let {data,error}=await client.rpc('get_public_birthdays');if(!error&&Array.isArray(data))snapshot.publicBirthdays=data;else snapshot.publicBirthdays=[];return snapshot}
 window.refreshCommunitySnapshot=async()=>{let {data:snapshot,error}=await client.rpc('get_app_snapshot');if(error)throw error;await addPollTallies(snapshot);await addEventAttendance(snapshot);await addPublicBirthdays(snapshot);window.activateCommunitySession({client,session:window.COMMUNITY_SESSION.session,profile:window.COMMUNITY_SESSION.profile,snapshot});return snapshot};
 async function activate(session){
   say('');
   let {data:profile,error}=await client.from('profiles').select('user_id,full_name,phone,house_number,requested_house_number,role,approval_status').eq('user_id',session.user.id).single();
   if(error||!profile){say('Rekod akaun belum tersedia. Pastikan skrip database sudah dipasang di Supabase.',true);$('#authSignOut').classList.remove('hidden');return}
   if(profile.approval_status!=='approved'||!profile.house_number){say('Permohonan diterima. AJK perlu meluluskan akaun dan pautkan nombor rumah sebelum akses dibuka.',false);$('#authSignOut').classList.remove('hidden');return}
   say('');
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
   await addEventAttendance(snapshot);
   await addPublicBirthdays(snapshot);
   window.activateCommunitySession({client,session,profile,snapshot});
   document.documentElement.classList.remove('auth-configured');
   $('#logoutButton').classList.remove('hidden');$('#logoutButton').onclick=async e=>{let restore=window.beginAppButtonBusy(e.currentTarget,'Log keluar…');try{await client.auth.signOut();location.reload()}finally{restore?.()}};
   gate.setAttribute('aria-hidden','true');
 }
 $('#authLoginForm').addEventListener('submit',async e=>{
   e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type="submit"]'),restore=window.beginAppButtonBusy(button,'Sedang log masuk…');if(!restore)return;
   try{let f=new FormData(form),{data,error}=await client.auth.signInWithPassword({email:String(f.get('email')).trim(),password:String(f.get('password'))});if(error){say('E-mel atau kata laluan tidak betul, atau pengesahan e-mel belum selesai.',true);return}await activate(data.session)}
   catch(error){say(error?.message||'Tidak dapat log masuk. Cuba lagi sebentar nanti.',true)}
   finally{restore()}
 });
 let signupPending=false;
 $('#authSignupForm').addEventListener('submit',async e=>{
   e.preventDefault();if(signupPending)return;
   let form=e.currentTarget,f=new FormData(form),phone=String(f.get('phone')).trim();
   if(!phone){say('Nombor telefon wajib diisi.',true);return}
   let button=form.querySelector('[type="submit"]'),restore=window.beginAppButtonBusy(button,'Menghantar permohonan…');if(!restore)return;
   signupPending=true;say('');
   try{
     let {data,error}=await client.auth.signUp({email:String(f.get('email')).trim(),password:String(f.get('password')),options:{data:{full_name:String(f.get('full_name')).trim(),phone,house_number:String(f.get('house_number'))}}});
     if(error){say(error.message,true);return}
     if(data.user?.identities?.length===0){say('E-mel ini mungkin sudah mempunyai akaun. Cuba log masuk atau hubungi admin taman.',true);return}
     if(data.session){let {error:signOutError}=await client.auth.signOut();if(signOutError)console.warn('Sesi permohonan kekal aktif; akses masih dikawal oleh status kelulusan.')}
     form.reset();
     showRequestSubmitted(!data.session);
   }catch(error){say(error?.message||'Permohonan tidak dapat dihantar. Cuba lagi sebentar nanti.',true)}
   finally{signupPending=false;restore()}
 });
 $('#returnToLogin').addEventListener('click',()=>switchForm('login'));
 document.addEventListener('click',e=>{let b=e.target.closest('[data-auth-switch]');if(b)switchForm(b.dataset.authSwitch)});
 $('#authSignOut').addEventListener('click',async e=>{let restore=window.beginAppButtonBusy(e.currentTarget,'Log keluar…');try{await client.auth.signOut();location.reload()}finally{restore?.()}});
 client.auth.getSession().then(async({data,error})=>{if(error)say('Tidak dapat menyambung ke Supabase: '+error.message,true);else if(data.session){let restore=window.beginAppButtonBusy($('#authLoginForm [type="submit"]'),'Memuatkan komuniti…');try{await activate(data.session)}catch(err){say(err?.message||'Tidak dapat memuatkan komuniti.',true)}finally{restore?.()}}});
 client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'&&document.documentElement.classList.contains('auth-configured'))say('Anda telah log keluar.')});
})();

