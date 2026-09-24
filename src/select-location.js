function OpenSelectLocation(conf) {
  if (new.target) throw Error("Object should not be called with 'new'");
  return new SelectLocation(conf);
}
class SelectLocation{
	iConf;
	iIntervalId;
	#iMap;
	#iWatchId;
	#iTileLayer;
	#iCurrentLocation;
	#iSelectedLocation;
	#iLine;
	#iResizeObserver;
	
    /**
     * 
     * @param {*} conf - The configuration's object
     * @param {String} conf.type - The Map API selection: 'gmap-then-osm' (default), 'gmap', or 'osm'.
	 * @param {String} conf.minDistanceTrackMeter - default: 1 meter.
     * @param {String} conf.GMapApiKey - The Google Map API KEY.
     * @param {String} conf.GMapID - The map ID of Google Map API.
     * @param {Element} conf.container - The container of map.
     * @param {Object} [conf.centerLatLng] - Optional: The Coordinate {lat:number,lng:number} of map's center location. If not defined, conf.selectedLatLng is used.
     * @param {Object} [conf.selectedLatLng] - Optional: The Coordinate {lat:number,lng:number} of selected location. If not defined, current location is used.
     * @param {Element} conf.confirmBtn - The confirm's button.
     * @param {Function} conf.onConfirm - The callback of confirm button (conf.confirmBtn on click listener).
     * @param {Element} conf.cancelBtn - The cancel's button selected location.
     * @param {Function} conf.onCancel - The callback of cancel's button (conf.cancelBtn on click listener). By default, this will destroy the map.
	 * @param {Boolean} conf.viewCurrentLocation - Default: false.
	 * @param {Boolean} conf.logEnable - Default: false.
     */
	constructor(conf={}){
		this.iConf=conf;
		if(this.iConf.confirmBtn!=null){
			this.iConf.confirmBtn.addEventListener('click',(e)=>{
				if(this.#iSelectedLocation==null){
					this.log('no location selected');
					return;
				}
				let latLng={};
				if(this.iConf.type!='osm'){
					latLng=this.#iSelectedLocation.position;
				}
				else latLng=this.#iSelectedLocation.getLatLng();
				
				//destroy the object map
				this.destroyMap();

				this.iConf.onConfirm(latLng);
			});
		}
		if(this.iConf.cancelBtn!=null){
			this.iConf.cancelBtn?.addEventListener('click',()=>{
				this.destroyMap();
				this.iConf.onCancel();
			});
		}
		if(this.iConf.type===undefined)this.iConf.type='gmap-then-osm';
		if(this.iConf.type.startsWith('gmap'))this.startGMap();
		else this.startOSM();
	}
	log(...args){
		if(this.iConf.logEnable)console.log(...args);
	}
	animateMarkerFade(targetMarker,duration) {
		const startTime = performance.now();
		const updateOpacity=(currentTime)=>{
			const elapsedTime = currentTime - startTime;
			
			// Calculate progress within a normalized 0 to 1 loop phase
			const progress = (elapsedTime % duration) / duration;
			
			// Convert progress into a smooth cosine wave swinging between 0 and 1
			// Math.cos mapped to [0, 1] range: 0.5 + 0.5 * cos(theta)
			const opacity = 0.5 + 0.5 * Math.cos(progress * 2 * Math.PI);
			
			// Update the legacy marker opacity property
			if(this.iConf.type!='osm')targetMarker.content.style.opacity=opacity;
			else targetMarker.setStyle({opacity:opacity,fillOpacity:opacity});
			
			// Request the next frame to continue infinitely
			this.iIntervalId=requestAnimationFrame(updateOpacity);
		};
		
		// Initiate the loop
		this.iIntervalId=requestAnimationFrame(updateOpacity);
	}
	destroyMap(){
		this.iConf.confirmBtn.disabled=true;
		this.iConf.cancelBtn.disabled=true;
		cancelAnimationFrame(this.iIntervalId);
		navigator.geolocation.clearWatch(this.#iWatchId);
		if(this.iConf.type=='osm' && this.#iMap){
			this.#iMap.off();
			this.#iMap.remove();
			this.#iTileLayer=null;
		}
		this.#iCurrentLocation=null;
		this.#iSelectedLocation=null;
		this.#iMap=null;
		if(this.#iResizeObserver!=null)this.#iResizeObserver.disconnect();
	}
	distance(latlng1, latlng2) {
		if(this.iConf.type!='osm'){
			const p1 = new google.maps.LatLng(latlng1.lat, latlng1.lng);
			const p2 = new google.maps.LatLng(latlng2.lat,latlng2.lng);

			return google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
		}
		else{
			var l1 = L.latLng(latlng1.lat,latlng1.lng);
			var l2 = L.latLng(latlng2.lat,latlng2.lng);
			return l1.distanceTo(l2);
		}
	}
	async startGMap(){
		window.gm_authFailure=()=>{
			window.gm_authFailure=()=>{};
			this.destroyMap();
			if(this.iConf.type==='gmap-then-osm')this.startOSM();
			else this.log('GMap authentication failure!');
		};
		try{
			if(this.iConf.GMapApiKey==='undefined' || this.iConf.GMapID==='undefined'){
				throw new Error("conf.GMapApiKey or conf.GMapID is not defined!");
			}
			const ms=5000; // ms
			const mainPromise = Promise.all([
				google.maps.importLibrary('maps'),
				google.maps.importLibrary('marker')
				]);
			const timeout=new Promise((_,reject)=>
				setTimeout(()=>reject(new Error("Connection Time Out "+ms+ "ms")), ms)
			);
			let [{ Map }, { AdvancedMarkerElement }] = await Promise.race([mainPromise, timeout]);

			const center=this.iConf.centerLatLng??(this.iConf.selectedLatLng??{lat:0,lng:0});
			this.#iMap = new Map(this.iConf.container,{
				center:center,
				zoom:this.iConf.zoom??18,gestureHandling:"greedy",
				mapId:this.iConf.GMapID,
				mapTypeId:google.maps.MapTypeId.SATELLITE
			});
			if(this.iConf.selectedLatLng!=null){
				this.#iSelectedLocation=new AdvancedMarkerElement({
					map:this.#iMap,
					position:this.iConf.selectedLatLng,
				});
			}
			if(this.iConf.confirmBtn!=null){
				this.#iMap.addListener('click',(e)=>{
					if(this.#iSelectedLocation==null){
						this.#iSelectedLocation=new AdvancedMarkerElement({
							map: this.#iMap,
							position:e.latLng,
						});
					}
					this.#iSelectedLocation.position=e.latLng;
				});
			}
			if(center.lat==0 || this.iConf.viewCurrentLocation){
				if("geolocation" in navigator) {
				navigator.geolocation.getCurrentPosition((pos)=>{
					const latlng={lat:pos.coords.latitude,lng:pos.coords.longitude};
					if(center.lat==0){
						this.#iMap.setCenter(latlng);
					}
					if(this.iConf.viewCurrentLocation){
						this.#iCurrentLocation=new AdvancedMarkerElement({
							map: this.#iMap,
							position:latlng
						});
						const bulet=document.createElement('div');
						bulet.style.cssText = 'background:#4285F4;border:2px solid #eee;border-radius:50%;padding:1rem';
						
						this.#iCurrentLocation.append(bulet);
						this.animateMarkerFade(this.#iCurrentLocation,1000);
					}
				},
				(error)=>this.log(error),{enableHighAccuracy:true});
				if(this.iConf.viewCurrentLocation){
					this.#iWatchId=navigator.geolocation.watchPosition((pos)=>{
						const latlng={lat:pos.coords.latitude,lng:pos.coords.longitude};
						this.#iCurrentLocation.position=latlng;
					},(error)=>this.log('Watch Error : ',error),{enableHighAccuracy:true});
				}
			}
			else{
				this.log('GeoLocation API is not supported by your browser');
			}
			}
		}catch(error){
			this.log('Failed using JS Google Maps API: "',error.message,(this.iConf.type==='gmap-then-osm'?'"-> Use JS Leaflet instead':''));
			this.destroyMap();
			if(this.iConf.type==='gmap-then-osm')this.startOSM();
		}
	}
	async startOSM(){
		this.iConf.type='osm';
		const center=this.iConf.centerLatLng??(this.iConf.selectedLatLng??{lat:0,lng:0});
		this.#iMap = L.map(this.iConf.container).setView(center, this.iConf.zoom??16);
		this.#iMap.on('baselayerchange',(e)=>{
			if (e.name==="Satellite"){
				var currentZoom=this.#iMap.getZoom();
				var maxAllowedZoom = 18; // Set your desired maximum zoom for satellite
				if (currentZoom > maxAllowedZoom) {
					this.#iMap.setZoom(maxAllowedZoom);
				}
			}
		});
		this.#iTileLayer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			preferCanvas: true,
			maxZoom:22,
			maxNativeZoom:18,
			attribution: '&copy; <a href="http://openstreetmap.org">OpenStreetMap</a>'
		}).addTo(this.#iMap);
		this.#iMap.zoomControl.setPosition('topright');
		var satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
			maxZoom:18,
			attribution:'<i>Powered by</i> Esri - World Imagery'
		});
		var baseMaps = {
			"Streets":this.#iTileLayer,
			"Satellite":satellite
		};
		var bm=L.control.layers(baseMaps).addTo(this.#iMap);
		bm.setPosition('topleft');
		var zoomDiv=this.#iMap.zoomControl.getContainer();
		var customButton=L.DomUtil.create('a','leaflet-control-custom-btn',zoomDiv);
		customButton.href='#';
		customButton.innerHTML='<b style="font-size:150%">&#9974;</b>';
		L.DomEvent.on(customButton,'click',(e)=>{
			L.DomEvent.stopPropagation(e); // Prevents map clicks passing through
			L.DomEvent.preventDefault(e);  // Prevents '#' URL routing
			let b=customButton.querySelector('b');
			b.classList.toggle("fullscreen");
			if(b.classList.contains('fullscreen'))this.iConf.container.requestFullscreen();
			else if(document.fullscreenElement!==null)document.exitFullscreen();
		});
		if(this.iConf.selectedLatLng!=null){
			this.#iSelectedLocation = L.marker(this.iConf.selectedLatLng).addTo(this.#iMap);
			this.#iSelectedLocation._icon.style.filter="hue-rotate(140deg)";
		}
		if(this.iConf.confirmBtn!=null){
			this.#iMap.on('click',(e)=>{
				if(this.#iSelectedLocation==null){
					this.#iSelectedLocation = L.marker(e.latlng).addTo(this.#iMap);
					this.#iSelectedLocation._icon.style.filter="hue-rotate(140deg)";
				}
				else this.#iSelectedLocation.setLatLng(e.latlng);
			});
		}
		this.#iResizeObserver= new ResizeObserver(()=>{
			this.#iMap.invalidateSize();
		});
		this.#iResizeObserver.observe(this.iConf.container);
		if(center.lat==0 || this.iConf.viewCurrentLocation){
			if("geolocation" in navigator) {
		  navigator.geolocation.getCurrentPosition((pos) => {
				const latlng={lat:pos.coords.latitude,lng:pos.coords.longitude};
				if(this.iConf.viewCurrentLocation){
					this.#iCurrentLocation=L.circleMarker(latlng,{color:'white',fillColor:'#4285F4',fillOpacity:0.9,radius:20}).addTo(this.#iMap);
					this.animateMarkerFade(this.#iCurrentLocation,1000);
				}
				if(center.lat==0)this.#iMap.panTo(latlng);
				this.#iMap.invalidateSize();
			},
			(error)=>{this.log('Error: ',error.message)},
			{enableHighAccuracy:true}
		  );
			if(this.iConf.viewCurrentLocation){
				this.#iWatchId=navigator.geolocation.watchPosition((pos)=>{
					const latlng={lat:pos.coords.latitude,lng:pos.coords.longitude};
					this.#iCurrentLocation.setLatLng(latlng);
					this.log('accuracy: ',pos.coords.accuracy,'meters');
				},(error)=>{this.log("1 : "+error.message)},
				{enableHighAccuracy:true,timeout:5000});
			}
		} else {
			this.log('GeoLocation API is not supported by your browser');
		}
		}
    }
}