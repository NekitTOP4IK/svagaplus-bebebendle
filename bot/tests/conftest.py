from __future__ import annotations

import os
import sys

_bot_src = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
if _bot_src not in sys.path:
    sys.path.insert(0, _bot_src)
