# Copy this file OUTSIDE the repo (e.g. <tts-env>/env.sh), set TTS_ENV, then: source <tts-env>/env.sh
# Keeps the Python venv, the Hugging Face model cache (~6 GB) and the pip cache in one permanent folder.
export TTS_ENV="/path/to/tts-env"          # placeholder: a folder outside the git repo
export TTS_VENV="$TTS_ENV/venv"
export HF_HOME="$TTS_ENV/hf_home"
export PIP_CACHE_DIR="$TTS_ENV/pip_cache"
export HF_HUB_DISABLE_TELEMETRY=1
if [ -f "$TTS_VENV/bin/activate" ]; then . "$TTS_VENV/bin/activate"; fi
