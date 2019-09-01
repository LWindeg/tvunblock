var initUrl = '';
var initSubtitle = '';
var video;
var player;
var seekBar;
var currentTime;
var apiInfo;
var defaultAudioLang = "Cantonese";
var selectedAudioLang;
var defaultSubtitleLang = "tc";
var defaultQuality = "low";
var selectedQulity;
var subtitleList;
var audioList;
var qualityList;
var contentId;
var defaultBitrateKbps = 0;
var bitrateKbps = 0;
var subtitleLive;
var youboraError1001 = false;

function initApp() {
	printLog("useragent= "+navigator.userAgent);
	// Debug logs, when the default of INFO isn't enough:
	//shaka.log.setLevel(shaka.log.Level.DEBUG);
	// Verbose logs, which can generate a lot of output:
	// shaka.log.setLevel(shaka.log.Level.V1);
	// Verbose 2, which is extremely noisy:
	// shaka.log.setLevel(shaka.log.Level.V2);

	// Install built-in polyfills to patch browser incompatibilities.
	hpvars.displaytxt = '';
	shaka.polyfill.installAll();

	video = document.getElementById('video');
	seekBar = document.getElementById('seekBar');
	currentTime = document.getElementById('currentTime');

	
	var api_domain = hpconfig.api_domain;
	var api_url;
	if(hpvars.videoType == "live"){
		api_url = "https://" + api_domain + "/rest_app_user_subscription_api/video_checkout/format/jsonp?device_type=WEB_"+getBrowser()+"&type=channel&id=" + hpvars.channel_code + "&token=" + hpvars.token;	
	} else {
		api_url = "https://" + api_domain + "/rest_app_user_subscription_api/video_checkout/format/jsonp?device_type=WEB_"+getBrowser()+"&type=video&id=" + hpvars.videoId + "&token=" + hpvars.token;
	}
	printLog("api_url= "+api_url);
	var jsonPromise = $.ajax({
		url: api_url,
		dataType: "jsonp",
		jsonp: "callback",
		type: 'GET',
		success: function(data) {
			getVideoInfo(data);
		}
	});

	jsonPromise.done(function(data) {
		if(typeof data.content != 'undefined') {
			if(data.content.error_code == 33445500 || data.content.error_code == 33556600){
				slaveExpiredRedirect(data.content.error_code);
			} else {
				hidePlayer("HP02-"+data.content.error_code);
				printLog("error= "+"HP02-"+data.content.error_code);
			}
		} else {
			// Check to see if the browser supports the basic APIs Shaka needs.
			if (shaka.Player.isBrowserSupported()) {
				// Everything looks good!
				initPlayer();
				/*
				conviva_rnd = Math.floor(Math.random() * 10) + 1;
				printLog("conviva_rnd= "+conviva_rnd);
				if(conviva_rnd == 1){
					runConviva();
				}
				*/
				initYoubora();
				//requestAds();
			} else {
				// This browser does not have the minimum set of APIs we need.
				console.error('Browser not supported!');
			}
		}
	});
}

function getVideoInfo(data) {
	apiInfo = data;
}

function initPlayer() {
	printLog("initPlayer:: ");
	$(".epg-left").css("width","945px");
	$(".live-epg .epg-left .epg .epg-row .epg-programme").css("width","837px");
	if (apiInfo.profiles.hasOwnProperty("low")){
		defaultQuality = "low";
	} else if (apiInfo.profiles.hasOwnProperty("high")){
		defaultQuality = "high";
	} else if (apiInfo.profiles.hasOwnProperty("hd")){
		defaultQuality = "hd";
	}
		
	if(hpvars.videoType == 'live'){
		initUrl = apiInfo.profiles[defaultQuality];
		contentId = 'ott_'+initUrl.split('ott_')[1].split("/")[0];	
		defaultAudioLang = "au1";
		defaultSubtitleLang = "zh";
		hpvars.quality_label = defaultQuality;
		hpvars.timeLimit = apiInfo.timeshift;	
  
		if(hpvars.timeLimit == 0){
			seekBar.style.display = 'none';
			currentTime.style.display = 'none';
		}
	} else {
		initUrl = apiInfo.profiles[defaultQuality].Default;  // api
		contentId = initUrl.split(':')[2].split('/')[3];
		if(typeof apiInfo.subtitle != 'undefined' && Object.keys(apiInfo.subtitle).length > 0) {
			defaultSubtitleLang = Object.keys(apiInfo.subtitle)[0];
			defaultSubtitle = apiInfo.subtitle[defaultSubtitleLang];
			initSubtitle = defaultSubtitle.replace('web_subtitle', 'web_subtitle_cors');
		} else {
			apiInfo.subtitle = {'auto':'https://api.ttml.mytvsuper.tvb.com/web_subtitle_default.php'};
			initSubtitle = 'https://api.ttml.mytvsuper.tvb.com/web_subtitle_default.php';
		}
		defaultAudioLang = "Cantonese";
		hpvars.quality_label = apiInfo.profiles[defaultQuality].quality;

		// create VOD subtitle list
		subtitleList = apiInfo.subtitle;
		var subtitleMenu = document.getElementById('textLanguages');
		for (var key in subtitleList) {
			var opt = document.createElement('option');
			opt.value = key;
			opt.innerHTML = langConvert(key);
			subtitleMenu.appendChild(opt);
			if(key == defaultSubtitleLang)
				opt.setAttribute('selected', true);
		}
	}
    hpvars.video_stage = apiInfo.video_stage;
	qualityList = apiInfo.profiles;
	delete qualityList.auto;
	//apiInfo.disclaimer_image = "http://img.tvb.com/ti_img/myTVSuperSFM/2330/5b7e8e11b13f2_1535020561.jpg";
	if(apiInfo.disclaimer_image != ""){
		hpvars.showFlip = true;
		$("#flipContainer img").attr("src",apiInfo.disclaimer_image);
        $("#flipContainer").show();
    }
	
	//printLog("video Url= "+initUrl);
	printLog("Audio Lang= "+defaultAudioLang);
	printLog("Subtitle Lang= "+defaultSubtitleLang);
	printLog("quality label= "+defaultQuality);
	printLog("Subtitle= "+initSubtitle);

	player = new shaka.Player(video);

	// Use Shaka Controls
	controls_ = new ShakaControls();
	castProxy_ = new shaka.cast.CastProxy(video, player, '658CCD53');
	controls_.init(castProxy_, onError, null);

	player.getNetworkingEngine().registerResponseFilter(licensePostProcessor);

	player.getNetworkingEngine().registerRequestFilter(function(type, request) {
		if (type == shaka.net.NetworkingEngine.RequestType.LICENSE) {
			printLog('LA url: ' + request.uris[0]);
			//console.log('SOAPAction: '+request.headers['SOAPAction']);

			if (request.headers['SOAPAction']) {
				request.headers['Content-Type'] = 'text/xml';
			} else {
				request.headers['Content-Type'] = 'application/octet-stream';
			}
			// for playback attributes
			request.headers['X-Service-ID'] = 'super';
			request.headers['X-Client-Platform'] = 'html5';
			request.headers['X-User-Token'] = hpvars.token;
		}
	});

	loadPlayer();
}

function loadPlayer() {
	// Create a Player instance.
	var url = initUrl;
	var laUrlWv = hpconfig.initLaUrlWv + contentId;
	var laUrlPr = hpconfig.initLaUrlPr + contentId;
	var subtitleUrl = initSubtitle;

	// Attach player to the window to make it easy to access in the JS console.
	window.player = player;

	// Listen for error events.
	player.addEventListener('error', onErrorEvent);

	// Listen for audio/text change events.
	player.addEventListener('trackschanged', onTracksChanged);
	player.addEventListener('adaptation', onAdaptation);
	document.getElementById('tracks').addEventListener('change', onTrackSelected);
	document.getElementById('audioLanguages').addEventListener('change', onAudioLanguageSelected);
	document.getElementById('textLanguages').addEventListener('change', onTextLanguageSelected);

	// Listen for time update events.
	video.addEventListener('timeupdate', updateTime);
	if(!selectedAudioLang){
		selectedAudioLang = defaultAudioLang;
	}

  	var config = /** @type {shakaExtern.PlayerConfiguration} */({ 
		abr: {},
		manifest: { 
			dash: {} 
		},
      	drm: {
        	servers: {
             	'com.widevine.alpha': laUrlWv,
               	'com.microsoft.playready': laUrlPr
            },
          	advanced: {
          		'com.widevine.alpha': {
              	'persistentStateRequired': true,
              	'videoRobustness': 'SW_SECURE_CRYPTO',
              	'audioRobustness': 'SW_SECURE_CRYPTO'
       			}
        	}
       	},
      	preferredAudioLanguage: selectedAudioLang,
       	preferredTextLanguage: 'zh'
	});
  	config.manifest.dash.clockSyncUri = hpconfig.clockSyncUri + "?t=" + Math.random();
	player.configure(config);
	// Try to load a manifest.
	// This is an asynchronous process.
	
	if(hpvars.videoType === 'live'){
		subtitleLive = player.getTextTracks();	
	}
	player.load(url, hpvars.startPosition).then(function() {
		// This runs if the asynchronous load is successful.
		console.log('The video has now been loaded!');
		//player.setTextTrackVisibility(true);

		var promise = document.querySelector('video').play();

		if (promise !== undefined) {
			promise.then(_ => {
			// Autoplay started!
				hpvars.autoplay = true;
				if(hpvars.videoType === 'live'){
					if(hpvars.showFlip){
						$("#giantPlayButtonContainer").css("display","none");
						video.volume = 0;
						video.pause();
						showFlip();
					} else {
						video.play();
					}
				} else {
					if(typeof(ads) === "undefined"){
						printLog("ads undefined");
						if(hpvars.showFlip){
							video.pause();
							showFlip();
						} else {
							video.play();
						}
					} else {
						$("#giantPlayButtonContainer").css("display","none");
						video.pause();
						requestAds();
					}
				}
			}).catch(error => {
				// Autoplay was prevented.
				// Show a "Play" button so that user can start playback.
				hpvars.autoplay = false;
				$("#giantPlayButtonContainer").css("display","block");
				if(typeof(ads) === "undefined"){
					console.log("ads undefined");
					if(hpvars.showFlip){
						$("#giantPlayButtonContainer").show();
					} else {
						console.log("ads undefined and no flip");
					}
				}
			});
		}

		// Try external subtitle
        if(hpvars.videoType !== 'live'){
            player.addTextTrack(subtitleUrl, defaultSubtitleLang, 'subtitle', 'application/ttml+xml', null);
            player.setTextTrackVisibility(true);
        } else if(Object.keys(subtitleLive).length !== 0){
            player.setTextTrackVisibility(true);
        }

	}).catch(onError); // onError is executed if the asynchronous load fails.
}

function licensePostProcessor(type, response) {
	// A generic filter for all responses, so filter on type LICENSE:
	if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) return;
}

function unloadPlayer() {
	window.player = player;
	player.unload().then(function() {
		// This runs if the asynchronous load is successful.
		console.log('The video has now been unloaded!');
	}).catch(onError); // onError is executed if the asynchronous unload fails.
	//player.destroy();
}

function onTracksChanged(event) {
	printLog("onTracksChanged::");
	updateAudioLanguages();
	updateTextLanguages();
	updateTracks();
}

function updateTracks() {
	var list = document.getElementById('tracks');
	//var langList = document.getElementById('audioLanguages');
	//var language = langList.selectedIndex >= 0 ? langList.options[langList.selectedIndex].value : '';
	var tracks = player.getVariantTracks();

        tracks.forEach(function(track) {
		if(track.active){
			bitrateKbps = Math.floor(track.bandwidth/1000);
			/*
			if(conviva_rnd == 1){
				playerStateManager.setBitrateKbps(bitrateKbps);
			}
			*/
		}
        });

	// Remove old tracks
	while (list.firstChild) {
		list.removeChild(list.firstChild);
	}
	
	for (var key in qualityList) {
		var opt = document.createElement('option');
		opt.value = key;
		opt.innerHTML = langConvert(key);
		list.appendChild(opt);
		if(typeof(selectedQulity) == 'undefined')
			selectedQulity = defaultQuality;
		if(key == selectedQulity){
			opt.setAttribute('selected', true);
			//hpvars.quality_label = selectedQulity;
		}
	}
}

function updateAudioLanguages() {
	var list = document.getElementById('audioLanguages');
	var languages = player.getAudioLanguages();
	var tracks = player.getVariantTracks();	
	updateLanguageOptions("audio", list, languages, tracks);
}

function updateTextLanguages() {
	var list = document.getElementById('textLanguages');
	if (player.isLive()) {
		var languages = player.getTextLanguages();
		var tracks = player.getTextTracks();
		updateLanguageOptions("text", list, languages, tracks);
	}
}

function updateLanguageOptions(type, list, languages, tracks) {
	// Remove old options
	while (list.firstChild) {
		list.removeChild(list.firstChild);
	}

	var activeTracks = tracks.filter(function(track) {
		
		return track.active == true;
	});
	var selectedTrack = activeTracks[0];

	if(languages.length <= 0){
		var lang = "auto";
		var option = document.createElement('option');
		option.textContent = langConvert(lang);
		option.value = lang;
		option.selected = lang;
		list.appendChild(option);	

	} else {
	// Populate list with new options.
		languages.forEach(function(lang) {
			var option = document.createElement('option');
			option.textContent = langConvert(lang);
			option.value = lang;
			option.selected = lang == selectedTrack.language;
			if(type == "audio"){
				selectedAudioLang = selectedTrack.language;
			}
			list.appendChild(option);
		});
	}
}

function onAdaptation(event) {
	var list = document.getElementById('tracks');

	// Find the row for the active track and select it.
	var tracks = player.getVariantTracks();
	tracks.forEach(function(track) {
		if (!track.active) return;

		for (var i = 0; i < list.options.length; ++i) {
			var option = list.options[i];
			if (option.value == track.id) {
				option.selected = true;
				break;
			}
		}
	});
}

function refreshTextTrack() {
	if(hpvars.videoType !== "live" ||  (typeof(subtitleLive) !== "undefined" && Object.keys(subtitleLive).length !== 0)){	
		player.setTextTrackVisibility(false);
		player.setTextTrackVisibility(true);
	}
}
function onTrackSelected(event) {
	var list = event.target;
	var option = list.options[list.selectedIndex].value;
	//var track = option.track;
	var url;
	printLog("onTrackSelected:: option=" + option);
	hpvars.changeSetting = true;	
	var textLangList = document.getElementById('textLanguages');
	var Textlang = textLangList.selectedIndex >= 0 ? textLangList.options[textLangList.selectedIndex].value : '';

/*
	if (list.id == 'tracks') {
		// Disable abr manager before changing tracks
		var config = {
			abr: {
				enabled: false
			}
		};
		player.configure(config);

		player.selectVariantTrack(track, true);
	}
*/
	
	if(hpvars.videoType == 'live'){	
		url = apiInfo.profiles[option];
	} else {
		url = apiInfo.profiles[option].Default;
		hpvars.quality_label = apiInfo.profiles[option].quality;
        for (var key in subtitleList) {
        	if (key == Textlang) {
             	subtitleUrl = subtitleList[key].replace("web_subtitle", "web_subtitle_cors");
               	break;
          	}
      	}
	}
	
	if (url == null || url == '') {
		return;
	} else {
		player.configure({ 
			preferredAudioLanguage: selectedAudioLang,
			preferredTextLanguage: Textlang 
		});
		selectedQulity = option;
		player.load(url, video.currentTime).then(function() {
			//player.setTextTrackVisibility(true);
			//setQualityLabel(selectedQulity);
			setQualityLabel(hpvars.quality_label);
			if(hpvars.videoType != 'live')
				player.addTextTrack(subtitleUrl, Textlang, 'subtitle', 'application/ttml+xml', null);
			else
				refreshTextTrack();
			video.play();
		}).catch(onError);
	}
}

function onAudioLanguageSelected(event) {
	var list = event.target;
	var language = list.options[list.selectedIndex].value;
   	printLog("onAudioLanguageSelected:: option=" + language);
	hpvars.changeSetting = true;	
	player.selectAudioLanguage(language);
	selectedAudioLang = language;
}

function onTextLanguageSelected(event) {
	var list = event.target;
	var language = list.options[list.selectedIndex].value;
        printLog("onTextLanguageSelected:: option=" + language);	
	hpvars.changeSetting = true;	
	if (player.isLive()) {
		player.selectTextLanguage(language);
	} else {
		//var url = document.getElementById('inputUrl').value;
		var url = initUrl;
		for (var key in subtitleList) {
			if (key == language) {
				subtitleUrl = subtitleList[key].replace("web_subtitle", "web_subtitle_cors");
				break;
			}
		}
		if (subtitleUrl == null || subtitleUrl == '') {
			return;
		} else {
			player.configure({ preferredAudioLanguage: selectedAudioLang });
			player.load(url, video.currentTime).then(function() {
				//player.setTextTrackVisibility(true);
				player.addTextTrack(subtitleUrl, language, 'subtitle', 'application/ttml+xml', null);
				video.play();
			}).catch(onError);
		}
	}
}

function updateTime(event) {
	if (player.isLive()) {
		//console.log("timeUpdate:::: video.currentTime= "+video.currentTime);
		//var tmpCurrentTime = parseInt(video.currentTime);
		//video.currentTime = tmpCurrentTime; 	
		//document.getElementById('displayTime').innerHTML = toDateTime(video.currentTime);
	} else {
		if(!isNaN(video.duration))
      			document.getElementById('displayTime').innerHTML = toDateTime(video.duration, (video.duration >= 3600));
	}
	//playHeadTime = $('#currentTime').text();
	//console.log("updateTime::: playHeadTime= "+playHeadTime);
	//console.log('The current time is ' + video.currentTime + ' Date: ' + toDateTime(video.currentTime));
}

/*
function toDateTime(secs) {
	//var t = new Date(2000, 0, 1); // Epoch
	var t = new Date(Date.UTC(2000, 0, 1, 0));
	t.setSeconds(secs);
	t = t.toTimeString().split(' ')[0];
	return t;
}
*/

function toDateTime(displayTime, showHour) {
  var h = Math.floor(displayTime / 3600);
  var m = Math.floor((displayTime / 60) % 60);
  var s = Math.floor(displayTime % 60);
  if (s < 10) s = '0' + s;
  var text = m + ':' + s;
  if (m < 10) text = '0' + text;
  if (showHour) {
    text = h + ':' + text;
  }
  return text;
}

function reloadPlayer() {
	unloadPlayer();
	loadPlayer();
}

function onErrorEvent(event) {
	// Extract the shaka.util.Error object from the event.
	onError(event.detail);
}

function onError(error) {
	// Log the error.
	console.error('Error code', error.code, 'object', error);
	printLog("onError:: error code= "+error.code);
	if(!youboraError1001){
		window.youbora.errorHandler("HP01-"+error.code,"HP01-"+error.code+", data="+error.data.toString());
		if(error.code == 1001){
			youboraError1001 = true;
		}
	}
    if(error.code == "6007"){
    	slaveExpiredRedirect("HP01-"+error.code);
   	} else if(error.category == 1 || error.category == 6){
     	hidePlayer("HP01-"+error.code);
		video.pause();
		/*
       	if(conviva_rnd == 1){
			playerStateManager.sendError("HP01-"+error.code,Conviva.Client.ErrorSeverity.FATAL);
          	cleanupSession();
		}
		*/
	}
	//window.youbora.errorHandler("HP01-"+error.code);
}

// ads
// Copyright 2013 Google Inc. All Rights Reserved.
// You may study, modify, and use this example for any purpose.
// Note that this example is provided "as is", WITHOUT WARRANTY
// of any kind either expressed or implied.
var adsManager;
var adsLoader;
var adDisplayContainer;
var intervalTimer;
var video;
var ad;
var ads_volume_level=1;
var haveSurveyCompleted = false;

function adInit() {
	//video.currentTime = 0;
	requestAds();
}

function setAdsVolume(tmp_volume){
	ads_volume_level= tmp_volume;
}

function createAdDisplayContainer() {
	// We assume the adContainer is the DOM id of the element that will house
	// the ads.
	adDisplayContainer =
		new google.ima.AdDisplayContainer(
			document.getElementById('adContainer'), video);
}

function requestAds() {
	printLog("requestAds::");
	// Create the ad display container.
	createAdDisplayContainer();
	// Initialize the container. Must be done via a user action on mobile devices.
	adDisplayContainer.initialize();
	// Create ads loader.
	adsLoader = new google.ima.AdsLoader(adDisplayContainer);
	// Listen and respond to ads loaded and error events.
	adsLoader.addEventListener(
		google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
		onAdsManagerLoaded,
		false);
	adsLoader.addEventListener(
		google.ima.AdErrorEvent.Type.AD_ERROR,
		onAdError,
		false);

	// Request video ads.
	var adsRequest = new google.ima.AdsRequest();
	adsRequest.adTagUrl = hpvars.adTag;

	// Specify the linear and nonlinear slot sizes. This helps the SDK to
	// select the correct creative if multiple are returned.
	adsRequest.linearAdSlotWidth = 640;
	adsRequest.linearAdSlotHeight = 360;

	adsRequest.nonLinearAdSlotWidth = 640;
	adsRequest.nonLinearAdSlotHeight = 360;

	adsLoader.requestAds(adsRequest);
}

function contentEndedListener() {
	if (typeof(adsLoader) != 'undefined') {
		adsLoader.contentComplete();
	}
}

function onAdsManagerLoaded(adsManagerLoadedEvent) {
	// Get the ads manager.
	var adsRenderingSettings = new google.ima.AdsRenderingSettings();
	adsRenderingSettings.restoreCustomPlaybackStateOnAdBreakComplete = true;
	adsManager = adsManagerLoadedEvent.getAdsManager(
		video, adsRenderingSettings);
	// Add listeners to the required events.
	adsManager.addEventListener(
		google.ima.AdErrorEvent.Type.AD_ERROR,
		onAdError);
	adsManager.addEventListener(
		google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED,
		onContentPauseRequested);
	//adsManager.addEventListener(
	//	google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
	//	onContentResumeRequested);
	adsManager.addEventListener(
		google.ima.AdEvent.Type.ALL_ADS_COMPLETED,
		onAdEvent);

	// Listen to any additional events, if necessary.
	adsManager.addEventListener(
		google.ima.AdEvent.Type.LOADED,
		onAdEvent);
	adsManager.addEventListener(
		google.ima.AdEvent.Type.STARTED,
		onAdEvent);
	adsManager.addEventListener(
		google.ima.AdEvent.Type.SKIPPED,
		onAdEvent);
	adsManager.addEventListener(
		google.ima.AdEvent.Type.COMPLETE,
		onAdEvent);

	try {
		// Initialize the ads manager. Ad rules playlist will start at this time.
		if(video.clientWidth <= 640)
			adsManager.init(640, 360, google.ima.ViewMode.NORMAL);
		else
			adsManager.init(video.clientWidth, video.clientHeight, google.ima.ViewMode.FULLSCREEN);
		// Call play to start showing the ad. Single video and overlay ads will
		// start at this time; the call will be ignored for ad rules.
		adsManager.start();
	} catch (adError) {
		//console.log(adError);
		// An error may be thrown if there was a problem with the VAST response.
		video.play();
	}
}

function onAdEvent(adEvent) {
	// Retrieve the ad from the event. Some events (e.g. ALL_ADS_COMPLETED)
	// don't have ad object associated.
	printLog("onAdEvent:: "+adEvent.type);
	ad = adEvent.getAd();
	switch (adEvent.type) {
		case google.ima.AdEvent.Type.LOADED:
			// This is the first event sent for an ad - it is possible to
			// determine whether the ad is a video ad or an overlay.
			if (!ad.isLinear()) {
				// Position AdDisplayContainer correctly for overlay.
				// Use ad.width and ad.height.
				video.play();
			}
			break;
		case google.ima.AdEvent.Type.STARTED:
			// This event indicates the ad has started - the video player
			// can adjust the UI, for example display a pause button and
			// remaining time.
			var adsTime = remainingTime = 0;
			var adsTime_min = adsTime_sec = 0;
			if (ad.isLinear()) {
				// For a linear ad, a timer can be started to poll for
				// the remaining time.
				adsManager.setVolume(ads_volume_level);
				var adsDuration = ad.getDuration();
				adsDuration_min = Math.floor(adsDuration / 60);
				adsDuration_sec = parseInt(adsDuration % 60);
				$("#adContainer").css("display", "block");
				intervalTimer = setInterval(
					function() {
						remainingTime = adsManager.getRemainingTime();
						adsTime = adsDuration - remainingTime + 1;
						adsTime_min = Math.floor(adsTime / 60);
						adsTime_sec = parseInt(adsTime % 60);
						countdownUi.innerHTML = langConvert('ads') + " (" + pad(adsTime_min, 2) + " : " + pad(adsTime_sec, 2) + " / " + pad(adsDuration_min, 2) + " : " + pad(adsDuration_sec, 2) + ")";
					
						if(adsTime >= adsDuration){
							countdownUi.innerHTML = "";
							clearInterval(intervalTimer);
							$("#adContainer").css("display", "none");
						}
					},
					300); // every 300ms
			}
        	if(hpvars.showFlip){
            	$("#flipContainer").show();
        	}
			break;

			case google.ima.AdEvent.Type.SKIPPED:

				if (ad.isLinear()) {
					countdownUi.innerHTML = "";
					clearInterval(intervalTimer);
				}
				printLog("survey url= "+ad.getSurveyUrl());
				var surveyUrl = ad.getSurveyUrl();
				if(surveyUrl){
					var surveyUrlArr = surveyUrl.split("/");
					var surveyId = surveyUrlArr[surveyUrlArr.length-1];
					printLog("survey id= "+surveyId);
					haveSurveyCompleted = survey.checkInvalidSurveyBeforeRender(surveyId);
				} else {
					haveSurveyCompleted = true;
				}
				printLog(haveSurveyCompleted);

				if(haveSurveyCompleted){
					onContentResumeRequested();
				} else {
					video.pause();
					$("#giantPlayButtonContainer").css("display","block");
					 survey.midRollSurvey(surveyId);
				}
				break;



		case google.ima.AdEvent.Type.COMPLETE:
			// This event indicates the ad has finished - the video player
			// can perform appropriate UI actions, such as removing the timer for
			// remaining time detection.
			if (ad.isLinear()) {
				countdownUi.innerHTML = "";
				clearInterval(intervalTimer);
			}
			printLog("survey url= "+ad.getSurveyUrl());
			var surveyUrl = ad.getSurveyUrl();
			if(surveyUrl){
				var surveyUrlArr = surveyUrl.split("/");
				var surveyId = surveyUrlArr[surveyUrlArr.length-1];
				printLog("survey id= "+surveyId);
				haveSurveyCompleted = survey.checkInvalidSurveyBeforeRender(surveyId);
			} else {
				haveSurveyCompleted = true;
			}
			printLog(haveSurveyCompleted);

			if(haveSurveyCompleted){
				onContentResumeRequested();
			} else {
				video.pause();
				$("#giantPlayButtonContainer").css("display","block");
				 survey.midRollSurvey(surveyId);
			}
			break;
		case google.ima.AdEvent.Type.ALL_ADS_COMPLETED:
			if(video.ended){
				if(hpvars.haveSurvey){
					survey.videoEndCall(hpvars.nextVID);
				} else if(hpvars.nextVID != ""){
		  			nextEpURL(hpvars.nextVID);
				}
    		} else {
				video.play();
			}	
			break;
	}
}

function onAdError(adErrorEvent) {
	console.log("onAdError");
	console.log(adErrorEvent);
	if (typeof(adsManager) != 'undefined') {
		adsManager.destroy();
	}

	$("#adContainer").css("display", "none");
	//$('.control_overlay').css('display', 'block');
	if(hpvars.showFlip){
        showFlip();
    } else {
        video.play();
    }
}

function onContentPauseRequested() {
	printLog("onContentPauseRequested::");
	hpvars.adPlaying = true;
	window.youbora.ignoringAdHandler();
	var sec = 0;
	if (typeof ad == "object" && typeof ad.getAdPodInfo().getPodIndex() !== 'undefined') {
		sec = ad.getAdPodInfo().getPodIndex();
	}
	if(sec >= 0){
	video.pause();
	$('#giantPlayButtonContainer').css('display', 'none');
	$("#adContainer").css("display", "block");
	$('#controlsContainer').css('display', 'none');

	// This function is where you should setup UI for showing ads (e.g.
	// display ad timer countdown, disable seeking etc.)
	// setupUIForAds();
	}
}

function onContentResumeRequested() {
	printLog("onContentResumeRequested::");
	hpvars.adPlaying = false;
	$("#adContainer").css("display", "none");
	$('#controlsContainer').css('display', 'block');
	
	window.youbora.ignoredAdHandler();
	var sec = 0;
	if (typeof ad == "object" && typeof ad.getAdPodInfo().getPodIndex() !== 'undefined') {
		sec = ad.getAdPodInfo().getPodIndex();
	}
	if (sec == 0) {
		/*
		if(conviva_rnd == 1){
			client.adEnd(sessionKey);
		}
		*/
		if(hpvars.showFlip){
			printLog("hpvars.showFlip");
			showFlip();
		} else {
			video.play();
		}
		if (player.isLive())
			jumpToLive();
	} else if(sec > 0){
		/*
		if(conviva_rnd == 1){
			client.attachPlayer(sessionKey, playerStateManager);
		}
		*/
    	video.play();
	} else {
		if(hpvars.haveSurvey){
			survey.videoEndCall(hpvars.nextVID);
		} else if(hpvars.nextVID != ""){
       		nextEpURL(hpvars.nextVID);
		}
	}

}

function jumpToLive() {
	if (player.isLive()) {
    		video.currentTime = seekBar.max;
  	}
}

function pad(n, width, z) {
		z = z || '0';
		n = n + '';
		return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
	}
	// Wire UI element references and UI event listeners.

function langConvert(src) {
	var convert = src;
	if (hpvars.lang == 'tc') {
		switch (src.trim().toLowerCase()) {
			case 'cantonese':
				convert = '粵語';
				break;
			case 'mandarin':
				convert = '國語';
				break;
			case 'english':
				convert = '英語';
				break;
			case 'french':
				convert = '法語';
				break;
			case 'japanese':
				convert = '日語';
				break;
			case 'korean':
				convert = '韓語';
				break;
			case 'others':
				convert = '其他';
				break;
			case 'polish':
				convert = '波蘭語';
				break;
			case 'portuguese':
				convert = '葡萄牙語';
				break;
			case 'thai':
				convert = '泰語';
				break;
			case 'vietnamese':
				convert = '越南語';
				break;
			case 'channel':
				convert = '聲道';
				break;
			case 'caption':
				convert = '字幕';
				break;
			case 'quality':
				convert = '影片質素';
				break;
			case 'low':
				convert = '低';
				break;
			case 'high':
				convert = '中';
				break;
			case 'hd':
				convert = '高';
				break;
			case 'chi':
			case 'tc':
			case 'zh':
				convert = '繁中';
				break;
			case 'chs':
			case 'sc':
				convert = '简中';
				break;
			case 'eng':
			case 'en':
				convert = 'English';
				break;
			case 'au1':
				convert = '聲道1';
				break;
			case 'au2':
				convert = '聲道2';
				break;
			case 'au3':
				convert = '聲道3';
				break;
			case 'ads':
				convert = '廣告';
				break;
            case 'upnext':
                convert = '即將播放';
                break;
			default:
				convert = '自動';
		}
	} else if (hpvars.lang == 'en') {
		switch (src.trim().toLowerCase()) {
			case 'cantonese':
				convert = 'Cantonese';
				break;
			case 'mandarin':
				convert = 'Mandarin';
				break;
			case 'english':
				convert = 'English';
				break;
			case 'french':
				convert = 'French';
				break;
			case 'japanese':
				convert = 'Japanese';
				break;
			case 'korean':
				convert = 'Korean';
				break;
			case 'others':
				convert = 'Others';
				break;
			case 'polish':
				convert = 'Polish';
				break;
			case 'portuguese':
				convert = 'Portuguese';
				break;
			case 'thai':
				convert = 'Thai';
				break;
			case 'vietnamese':
				convert = 'Vietnamese';
				break;
			case 'channel':
				convert = 'Channel';
				break;
			case 'caption':
				convert = 'Subtitle';
				break;
			case 'quality':
				convert = 'Quality';
				break;
			case 'low':
				convert = 'low';
				break;
			case 'high':
				convert = 'middle';
				break;
			case 'hd':
				convert = 'high';
				break;
			case 'chi':
			case 'tc':
			case 'zh':
				convert = '繁中';
				break;
			case 'chs':
			case 'sc':
				convert = '简中';
				break;
			case 'eng':
			case 'en':
				convert = 'English';
				break;
			case 'au1':
				convert = 'audio 1';
				break;
			case 'au2':
				convert = 'audio 2';
				break;
			case 'au3':
				convert = 'audio 3';
				break;
			case 'ads':
				convert = 'Ads';
				break;
            case 'upnext':
                convert = 'Up Next';
                break;
			default:
				convert = 'auto';
		}
	}
	return convert;
}

function getBrowser(){
	// Firefox 1.0+
	var isFirefox = typeof InstallTrigger !== 'undefined';
	// Internet Explorer 6-11
	var isIE = /*@cc_on!@*/false || !!document.documentMode;
	// Edge 20+
	var isEdge = !isIE && !!window.StyleMedia;
	// Chrome 1+
	//var isChrome = !!window.chrome && !!window.chrome.webstore;
	var isChrome = $.browser.chrome;

	if(isChrome || isFirefox){
		return "CHROME";
	} else	if(isEdge || isIE){
		return "EDGE";
	}
}

function initYoubora() {
        printLog("initYoubora::");
        if (hpvars.videoId == "live") {
                yTitle = hpvars.programme;
                yIsLive = true;
        } else {
                yTitle = hpvars.programme + "-" + hpvars.episodeNo;
                yIsLive = false;
        }
        if (typeof $YB != "undefined") { // If youbora is correctly loaded
        window.youbora = new $YB.plugins.Shaka2(player, video, {
            // Account code and enable YOUBORA Analytics
            accountCode: hpconfig.youbora,
            enableAnalytics: true,
	    httpSecure: true,

            //View parameters
            username: hpvars.memberId,
            //transactionCode: "transactionTest",

            // Media info
            media: {
                title: yTitle,
                duration: hpvars.duration,
                isLive: yIsLive,
                resource: initUrl,
                cdn: ""
            },
	    properties:{
		filename: yTitle,          //assetName
		content_id: hpvars.videoId        //videoId
	    },
	    extraParams: {
		param1: "mytv_super_html5",
		//param2: "unknown",
		param3: hpvars.customer_stage,
		param4: apiInfo.video_stage,
		param5: "pc_network",
		param6: hpvars.resolution,
		param7: defaultQuality
	    }
            
        });
        }
}
