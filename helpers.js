(function () {
  var WHISPER_URL = "http://127.0.0.1:18080/inference";

  var phase = "idle";
  var mediaRecorder = null;
  var stream = null;
  var audioChunks = [];
  var voiceSubscribeFactory = null;
  var lastVoiceEvent = null;

  function emitVoiceEvent(nextPhase, transcript, result) {
    lastVoiceEvent = {
      phase: nextPhase || phase,
      transcript: transcript || "",
      result: !!result,
      at: Date.now(),
    };
    try {
      window.dispatchEvent(
        new CustomEvent("voice:change", { detail: lastVoiceEvent }),
      );
    } catch (e) {}
  }

  function setPhase(next, transcript, result) {
    phase = next;
    emitVoiceEvent(next, transcript, result);
  }

  function recorderConfig() {
    var opusWebm = "audio/webm;codecs=opus";
    if (
      window.MediaRecorder &&
      typeof MediaRecorder.isTypeSupported === "function" &&
      MediaRecorder.isTypeSupported(opusWebm)
    ) {
      return { options: { mimeType: opusWebm }, codecHint: opusWebm };
    }
    return { options: undefined, codecHint: "default" };
  }

  window.voicePhase = function () {
    return phase;
  };

  window.voiceSubscribe = function () {
    if (voiceSubscribeFactory) return voiceSubscribeFactory;
    var subscribers = [];
    window.addEventListener("voice:change", function (evt) {
      lastVoiceEvent = (evt && evt.detail) || lastVoiceEvent;
      for (var i = 0; i < subscribers.length; i++) {
        try {
          subscribers[i]();
        } catch (e) {}
      }
    });
    voiceSubscribeFactory = function (emit) {
      function fire() {
        emit(lastVoiceEvent);
      }
      subscribers.push(fire);
      if (lastVoiceEvent) fire(lastVoiceEvent);
      return function () {
        subscribers = subscribers.filter(function (fn) {
          return fn !== fire;
        });
      };
    };
    return voiceSubscribeFactory;
  };

  window.voiceAppend = function (current, text) {
    var trimmed = window.voiceClean(text);
    if (!trimmed) return current || "";
    current = current || "";
    return current && !/\s$/.test(current) ? current + " " + trimmed : current + trimmed;
  };

  window.voiceClean = function (text) {
    return (text || "")
      .replace(/\[(?:blank[_ -]?audio|silence|no[_ -]?speech)\]/gi, " ")
      .replace(/\r?\n/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  };

  window.voiceInsertText = function (text) {
    var cleaned = window.voiceClean(text);
    return cleaned ? cleaned + " " : " ";
  };

  window.voiceCopy = function (text) {
    var value = text || "";
    if (!value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).catch(function (e) {
        console.warn("clipboard write failed", e);
      });
    }
  };

  function stopStream() {
    if (stream) {
      try {
        var tracks = stream.getTracks();
        for (var i = 0; i < tracks.length; i++) tracks[i].stop();
      } catch (e) {}
      stream = null;
    }
  }

  function finish(text) {
    setPhase("idle", text || "", true);
  }

  function sendBlobToWhisper(blob) {
    var fd = new FormData();
    fd.append("file", blob, "audio.webm");
    fetch(WHISPER_URL, { method: "POST", body: fd })
      .then(function (res) {
        if (!res.ok) {
          console.warn("whisper-server returned", res.status);
          finish("");
          return;
        }
        return res.json().then(function (json) {
          var text = "";
          if (json && typeof json.text === "string") text = json.text;
          else if (json && typeof json.transcription === "string")
            text = json.transcription;
          finish(text);
        });
      })
      .catch(function (e) {
        console.warn("whisper fetch failed", e);
        finish("");
      });
  }

  function startRecording() {
    audioChunks = [];
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (s) {
        stream = s;
        var cfg = recorderConfig();
        try {
          mediaRecorder = new MediaRecorder(s, cfg.options);
        } catch (e) {
          console.warn("MediaRecorder create failed", e);
          stopStream();
          setPhase("idle");
          return;
        }
        mediaRecorder.ondataavailable = function (e) {
          if (e.data && e.data.size > 0) audioChunks.push(e.data);
        };
        mediaRecorder.onstop = function () {
          stopStream();
          var blob = new Blob(audioChunks, {
            type: cfg.codecHint === "default" ? "audio/webm" : cfg.codecHint,
          });
          audioChunks = [];
          mediaRecorder = null;
          setPhase("processing");
          sendBlobToWhisper(blob);
        };
        mediaRecorder.start();
        setPhase("recording");
      })
      .catch(function (e) {
        console.warn("getUserMedia failed", e);
        setPhase("idle");
      });
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      try {
        mediaRecorder.stop();
      } catch (e) {
        console.warn("MediaRecorder stop failed", e);
      }
      setPhase("processing");
    }
  }

  window.voiceToggle = function () {
    if (phase === "recording") {
      stopRecording();
      return "processing";
    }
    if (phase === "idle") {
      setPhase("starting");
      startRecording();
      return "starting";
    }
    return phase;
  };
})();
