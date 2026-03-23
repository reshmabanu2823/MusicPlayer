document.addEventListener("DOMContentLoaded", () => {

    const token = localStorage.getItem("token");

    if (token) {
        document.getElementById("auth-container").style.display = "none";
        document.getElementById("main-app").style.display = "flex";
        loadSongs();
    } else {
        document.getElementById("auth-container").style.display = "flex";
        document.getElementById("main-app").style.display = "none";
    }

    const validateEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    /* LOGIN */

    document.getElementById("login-form").addEventListener("submit", async (e) => {

        e.preventDefault();

        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;

        if (!validateEmail(email)) {
            alert("Please enter a valid email address");
            return;
        }

        const res = await fetch("http://localhost:3000/auth/login", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({email,password})
        });

        const data = await res.json();

        if(res.ok){
            localStorage.setItem("token",data.token);
            localStorage.setItem("userEmail",email);
            location.reload();
        }else{
            alert(data.message);
        }

    });


    /* REGISTER */

    document.getElementById("register-form").addEventListener("submit", async(e)=>{

        e.preventDefault();

        const name=document.getElementById("register-name").value;
        const email=document.getElementById("register-email").value;
        const password=document.getElementById("register-password").value;

        if(!validateEmail(email)){
            alert("Please enter valid email");
            return;
        }

        const res=await fetch("http://localhost:3000/auth/register",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({name,email,password})
        });

        const data=await res.json();

        if(res.ok){
            alert("Registration successful");
            showAuthPage("login");
        }else{
            alert(data.message);
        }

    });


    /* FORGOT PASSWORD */

    let forgotPasswordEmail="";

    document.getElementById("forgot-password-form").addEventListener("submit",async(e)=>{

        e.preventDefault();

        const email=document.getElementById("forgot-email").value;

        if(!validateEmail(email)){
            alert("Enter valid email");
            return;
        }

        const res=await fetch("http://localhost:3000/auth/forgot-password",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({email})
        });

        const data=await res.json();

        if(res.ok){
            forgotPasswordEmail=email;
            alert("OTP sent to email");
            showAuthPage("verify-otp");
        }else{
            alert(data.message);
        }

    });


    /* VERIFY OTP */

    document.getElementById("verify-otp-form").addEventListener("submit",async(e)=>{

        e.preventDefault();

        const otp=document.getElementById("otp-input").value;

        const res=await fetch("http://localhost:3000/auth/verify-otp",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({email:forgotPasswordEmail,otp})
        });

        const data=await res.json();

        if(res.ok){
            alert("OTP verified");
            showAuthPage("reset-password");
        }else{
            alert(data.message);
        }

    });


    /* RESET PASSWORD */

    document.getElementById("reset-password-form").addEventListener("submit",async(e)=>{

        e.preventDefault();

        const password=document.getElementById("reset-new-password").value;
        const confirmPassword=document.getElementById("reset-confirm-password").value;

        if(password!==confirmPassword){
            alert("Passwords do not match");
            return;
        }

        const res=await fetch("http://localhost:3000/auth/reset-password",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({email:forgotPasswordEmail,password})
        });

        const data=await res.json();

        if(res.ok){
            alert("Password reset successful");
            showAuthPage("login");
        }else{
            alert(data.message);
        }

    });


    /* NAVIGATION */

    document.getElementById("nav-songs").addEventListener("click",()=>{
        showPage("songs-page");
        loadSongs();
    });

    document.getElementById("nav-playlists").addEventListener("click",()=>{
        showPage("playlists-page");
        loadPlaylists();
        loadSongsForSelect();
        loadPlaylistsForSelect();
    });

    document.getElementById("nav-add-song").addEventListener("click",()=>{
        showPage("add-song-page");
    });

    document.getElementById("nav-logout").addEventListener("click",()=>{
        localStorage.removeItem("token");
        location.reload();
    });

    /* PROFILE BUTTON */

    document.getElementById("profile-btn").addEventListener("click", () => {
        showPage("profile-page");
        loadProfile();
    });

    /* CREATE PLAYLIST */

    document.getElementById("create-playlist-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("playlist-name").value;

        const res = await fetch("http://localhost:3000/playlist", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify({ name, songs: [] })
        });

        if(res.ok){
            alert("Playlist created!");
            document.getElementById("create-playlist-form").reset();
            loadPlaylists();
            loadPlaylistsForSelect();
        }
    });

    /* ADD SONG TO PLAYLIST */

    document.getElementById("add-song-to-playlist").addEventListener("click", async () => {
        const playlistId = document.getElementById("playlist-select").value;
        const songId = document.getElementById("song-select").value;

        if (!playlistId || !songId) {
            alert("Please select both playlist and song");
            return;
        }

        const res = await fetch(`http://localhost:3000/playlist/${playlistId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${localStorage.getItem("token")}`
            },
            body: JSON.stringify({ songId })
        });

        if(res.ok){
            alert("Song added to playlist!");
            loadPlaylists();
        }
    });

    /* ADD SONG */

    document.getElementById("add-song-form").addEventListener("submit", async (e) => {
        e.preventDefault();

        const title = document.getElementById("song-title").value;
        const artist = document.getElementById("song-artist").value;
        const album = document.getElementById("song-album").value;
        const duration = document.getElementById("song-duration").value;
        const audioFile = document.getElementById("song-audio-file").files[0];

        if (!audioFile) {
            alert("Please select an audio file");
            return;
        }

        try {
            const formData = new FormData();
            formData.append("title", title);
            formData.append("artist", artist);
            formData.append("album", album);
            formData.append("duration", duration);
            formData.append("file", audioFile);

            const res = await fetch("http://localhost:3000/songs", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${localStorage.getItem("token")}`
                },
                body: formData
            });

            const data = await res.json();

            if (res.ok) {
                alert("Song added successfully!");
                document.getElementById("add-song-form").reset();
                showPage("songs-page");
                loadSongs();
            } else {
                alert(data.error || "Failed to add song");
            }
        } catch (error) {
            alert("Error: " + error.message);
        }
    });


    /* SEARCH */

    document.getElementById("search-input").addEventListener("input",(e)=>{

        const query=e.target.value.trim();

        if(query){
            searchLibrarySongs(query);
        }else{
            loadSongs();
        }

    });

    /* AUTH PAGE SWITCHES */

    document.getElementById("show-register").addEventListener("click", () => showAuthPage("register"));
    document.getElementById("show-login").addEventListener("click", () => showAuthPage("login"));
    document.getElementById("show-forgot-password").addEventListener("click", () => showAuthPage("forgot-password"));
    document.getElementById("show-login-from-forgot").addEventListener("click", () => showAuthPage("login"));
    document.getElementById("show-login-from-otp").addEventListener("click", () => showAuthPage("login"));
    document.getElementById("show-login-from-reset").addEventListener("click", () => showAuthPage("login"));

    /* BACK TO SONGS */

    document.getElementById("back-to-songs-btn").addEventListener("click", () => {
        showPage("songs-page");
        loadSongs();
    });

});


/* AUTH PAGE SWITCH */

function showAuthPage(page){

    document.getElementById("login-page").style.display=page==="login"?"block":"none";
    document.getElementById("register-page").style.display=page==="register"?"block":"none";
    document.getElementById("forgot-password-page").style.display=page==="forgot-password"?"block":"none";
    document.getElementById("verify-otp-page").style.display=page==="verify-otp"?"block":"none";
    document.getElementById("reset-password-page").style.display=page==="reset-password"?"block":"none";

}


/* PAGE SWITCH */

function showPage(pageId){

    const pages=["songs-page","add-song-page","playlists-page","profile-page"];

    pages.forEach(p=>{
        document.getElementById(p).style.display=p===pageId?"block":"none";
    });

}


/* LOAD SONGS */

async function loadSongs(){

    try{

        const res=await fetch("http://localhost:3000/songs",{
            headers:{Authorization:`Bearer ${localStorage.getItem("token")}`}
        });

        const localSongs=await res.json();

        const libRes=await fetch("http://localhost:3000/library/songs");
        const librarySongs=await libRes.json();

        const formattedLibrarySongs=librarySongs.map(song=>({
            _id:song.id,
            title:song.name,
            artist:song.artist_name,
            album:song.album_name || "Jamendo",
            duration:"",
            audioUrl:song.audio
        }));

        const allSongs=[...localSongs,...formattedLibrarySongs];

        displaySongs(allSongs);

    }catch(error){
        console.error(error);
    }

}


/* SEARCH LIBRARY SONGS */

async function searchLibrarySongs(query){

    const res=await fetch(`http://localhost:3000/library/search?q=${encodeURIComponent(query)}`);
    const songs=await res.json();

    const formatted=songs.map(song=>({
        _id:song.id,
        title:song.name,
        artist:song.artist_name,
        album:song.album_name || "Jamendo",
        duration:"",
        audioUrl:song.audio
    }));

    displaySongs(formatted);

}


/* DISPLAY SONGS */

function displaySongs(songs){

    const list=document.getElementById("songs-list");
    list.innerHTML="";

    songs.forEach(song=>{

        const card=document.createElement("div");
        card.className="song-card";

        card.innerHTML=`
        <img class="song-cover" src="https://picsum.photos/60?random=${song._id}">
        <div class="song-info">
        <h3>${song.title}</h3>
        <p>${song.artist} • ${song.album}</p>
        </div>
        `;

        card.addEventListener("click",()=>{

            document.getElementById("now-playing").innerText=
            `${song.title} — ${song.artist}`;

            const player=document.getElementById("audio-player");

            const audioUrl = song.file || song.audioUrl;

            if(audioUrl){
                player.src=audioUrl;
                player.play();
            }else{
                alert("Audio not available");
            }

        });

        list.appendChild(card);

    });

}

/* LOAD PLAYLISTS */

async function loadPlaylists(){
    try {
        const res = await fetch("http://localhost:3000/playlist", {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });

        const playlists = await res.json();

        const list = document.getElementById("playlists-list");
        if(!list) return;

        list.innerHTML = "";

        playlists.forEach(p => {
            const card = document.createElement("div");
            card.className = "playlist-card";
            
            const songCount = p.songs ? p.songs.length : 0;
            
            card.innerHTML = `
                <h3>${p.name}</h3>
                <p>${songCount} song${songCount !== 1 ? 's' : ''}</p>
                <button onclick="deletePlaylist('${p._id}')">Delete</button>
            `;
            
            list.appendChild(card);
        });
    } catch (error) {
        console.error("Error loading playlists:", error);
    }
}

/* DELETE PLAYLIST */

async function deletePlaylist(id){
    if(!confirm("Delete this playlist?")) return;

    await fetch(`http://localhost:3000/playlist/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
    });

    loadPlaylists();
    loadPlaylistsForSelect();
}

/* LOAD SONGS FOR SELECT */

async function loadSongsForSelect(){
    try {
        const res = await fetch("http://localhost:3000/songs", {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });

        const songs = await res.json();
        const select = document.getElementById("song-select");
        if(!select) return;

        select.innerHTML = '<option value="">Select Song</option>';

        songs.forEach(song => {
            const option = document.createElement("option");
            option.value = song._id;
            option.textContent = `${song.title} - ${song.artist}`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading songs for select:", error);
    }
}

/* LOAD PLAYLISTS FOR SELECT */

async function loadPlaylistsForSelect(){
    try {
        const res = await fetch("http://localhost:3000/playlist", {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });

        const playlists = await res.json();
        const select = document.getElementById("playlist-select");
        if(!select) return;

        select.innerHTML = '<option value="">Select Playlist</option>';

        playlists.forEach(p => {
            const option = document.createElement("option");
            option.value = p._id;
            option.textContent = p.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading playlists for select:", error);
    }
}

/* LOAD PROFILE */

async function loadProfile(){
    try {
        const userEmail = localStorage.getItem("userEmail") || "User";
        const profileName = document.getElementById("profile-name");
        const profileEmail = document.getElementById("profile-email");
        
        if(profileName) profileName.textContent = userEmail.split("@")[0].charAt(0).toUpperCase() + userEmail.split("@")[0].slice(1);
        if(profileEmail) profileEmail.textContent = userEmail;

        const songRes = await fetch("http://localhost:3000/songs", {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        const songs = await songRes.json();

        const playlistRes = await fetch("http://localhost:3000/playlist", {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        const playlists = await playlistRes.json();

        const totalSongs = document.getElementById("total-songs");
        const totalPlaylists = document.getElementById("total-playlists");
        if(totalSongs) totalSongs.textContent = songs.length;
        if(totalPlaylists) totalPlaylists.textContent = playlists.length;

    } catch (error) {
        console.error("Error loading profile:", error);
    }
}
