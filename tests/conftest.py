import sys, os

# Ensure project root is on sys.path for imports like `from pipeline...`
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

