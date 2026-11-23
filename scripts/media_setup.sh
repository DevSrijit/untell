#!/bin/sh
# Sets up the media tools once: a Python environment (.venv-media, ignored by git) with rembg, and the
# BiRefNet cut-out model (about 200 MB, saved in ~/.u2net). Needs uv (https://docs.astral.sh/uv/).
set -e
cd "$(dirname "$0")/.."
command -v uv >/dev/null || { echo "media:setup needs uv: https://docs.astral.sh/uv/getting-started/installation/"; exit 1; }
[ -x .venv-media/bin/python ] || uv venv -q .venv-media --python 3.12
uv pip install -q --python .venv-media/bin/python "rembg[cpu]" pillow numpy
# Download the model now, so the first prepare does not stall on it.
.venv-media/bin/python -c "from rembg import new_session; new_session('birefnet-general-lite'); print('media tools ready: rembg + BiRefNet')"
