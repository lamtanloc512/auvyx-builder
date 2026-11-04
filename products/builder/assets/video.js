/*
 * Auvyx Video, Autoplay: a player marked data-auvyx-autoplay starts muted (every browser lets a muted video start) and gets
 * its sound as soon as the browser allows it: at once where it already does (a <video> is tried with sound first; a
 * page the visitor has already used), otherwise at the visitor's first tap, click or key anywhere on the page. A button
 * on the video turns the sound on and off (WCAG 1.4.2). YouTube and Vimeo are driven through their own message APIs;
 * their iframes carry allow="autoplay", so the page's permission reaches them. A background video with sound gets the
 * same, its button on the box it fills (the video itself sits behind the content and takes no clicks).
 */
(function () {
	if (document.documentElement.hasAttribute("data-auvyx-editing")) return;
	var boxes = Array.prototype.slice.call(document.querySelectorAll("[data-auvyx-autoplay]"));
	if (!boxes.length) return;

	var ICON_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>';
	var ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';

	function send(frame, message) {
		try {
			frame.contentWindow.postMessage(JSON.stringify(message), "*");
		} catch {}
	}

	function setSound(box, on) {
		var media = box.querySelector("video, iframe");
		if (!media) return;
		if (media.tagName === "VIDEO") {
			media.muted = !on;
			if (on) {
				media.volume = 1;
				var played = media.play();
				// A browser that still refuses sound keeps the video playing, muted.
				if (played && played.catch) played.catch(function () { media.muted = true; media.play().catch(function () {}); mark(box, false); });
			}
		} else if (/youtube/.test(media.src)) {
			send(media, { event: "command", func: on ? "unMute" : "mute", args: [] });
			if (on) {
				send(media, { event: "command", func: "setVolume", args: [100] });
				send(media, { event: "command", func: "playVideo", args: [] });
			}
		} else if (/vimeo/.test(media.src)) {
			send(media, { method: "setMuted", value: !on });
			if (on) {
				send(media, { method: "setVolume", value: 1 });
				send(media, { method: "play" });
			}
		}
		mark(box, on);
	}

	function mark(box, on) {
		box.classList.toggle("auvyx-video--sound", on);
		var button = box.auvyxSoundButton || box.querySelector(".auvyx-video__sound");
		if (button) button.classList.toggle("is-on", on);
		if (button) {
			button.innerHTML = on ? ICON_ON : ICON_OFF;
			button.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
			button.setAttribute("aria-pressed", on ? "true" : "false");
		}
	}

	// Once the iframe has loaded (its player listens only then).
	function whenReady(box, run) {
		var frame = box.querySelector("iframe");
		if (!frame) return run();
		var done = false;
		function go() { if (!done) { done = true; setTimeout(run, 400); } }
		frame.addEventListener("load", go);
		if (frame.contentDocument === null) setTimeout(go, 1500);
	}

	boxes.forEach(function (box) {
		var button = document.createElement("button");
		button.type = "button";
		button.className = "auvyx-video__sound";
		// A background's button goes on the box it fills, above the content.
		var host = box.classList.contains("auvyx-bg-video") && box.parentElement ? box.parentElement : box;
		host.appendChild(button);
		box.auvyxSoundButton = button;
		mark(box, false);
		button.addEventListener("click", function (event) {
			event.stopPropagation();
			setSound(box, !box.classList.contains("auvyx-video--sound"));
		});
		var video = box.querySelector("video");
		if (video) {
			// With sound first: a browser that allows it plays it so; one that does not plays it muted.
			video.muted = false;
			var tried = video.play();
			if (tried && tried.then) tried.then(function () { mark(box, true); }, function () { video.muted = true; video.play().catch(function () {}); });
		} else if (navigator.userActivation && navigator.userActivation.hasBeenActive) {
			whenReady(box, function () { setSound(box, true); });
		}
	});

	// The visitor's first gesture anywhere on the page lets the sound in.
	var events = ["pointerdown", "keydown", "touchstart"];
	function first(event) {
		if (event.target && event.target.closest && event.target.closest(".auvyx-video__sound")) return;
		events.forEach(function (type) { removeEventListener(type, first, true); });
		boxes.forEach(function (box) { if (!box.classList.contains("auvyx-video--sound")) setSound(box, true); });
	}
	events.forEach(function (type) { addEventListener(type, first, { capture: true, passive: true }); });
})();
