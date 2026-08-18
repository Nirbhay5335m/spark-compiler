import sys
from pathlib import Path

# Ensure project root and backend root are in sys.path
root_dir = Path(__file__).resolve().parent.parent.parent
backend_dir = Path(__file__).resolve().parent.parent

if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
