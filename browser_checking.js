/*browser checking*/
function checkReject(browserName, versionNumber) {
	var acceptList = [];
	acceptList['safari'] = 8;
	
	acceptList['msie'] = 11;
	acceptList['chrome'] = 56;
	acceptList['mozilla'] = 35;
	acceptList['msedge'] = 10;
	
	if(navigator.userAgent.search(/TV/i) >= 0){   //is smarttv
		return false;
	}
	if( /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ) { //is mobile
		return false;
	}
	if(acceptList[browserName] && acceptList[browserName]<=versionNumber){
		/*
		if(browserName == 'safari'){
			if(versionNumber > 11){
				return false;
			}
		}
		*/
		return true;
	}else {
		return false;
	}
}

(function(){
	var browserChecking = window.browserChecking = (window.browserChecking||{});

	browserChecking.init = function() {	
		var isBrowserChecked = readCookie('browserChecked');
		if(isBrowserChecked && isBrowserChecked=='yes'){
			//console.log("Browser checked before ok");
			$('.device-checker').addClass('browser-checked');
			if($('input[name="device_id"]').val() != '' && !$('form.pair').hasClass('submitted')){
				if($('.pair-device').length >= 1){
					submitDevicePairing();
					$('form.pair').addClass('submitted');
				} else {
					slavePairing();
					$('form.pair').addClass('submitted');
				}
			}
		} else {
			$('.device-checker').addClass('browser-checked');
			createCookie('browserChecked','yes',8760);
		}
	}
})();
