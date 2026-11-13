from flask import Blueprint
from flask_cors import CORS
from config import ALLOWED_ORIGINS_LIST

dashboard_bp = Blueprint('dashboard', __name__)

# CORS do dashboard conforme ALLOWED_ORIGINS
CORS(dashboard_bp, resources={r"/*": {"origins": ALLOWED_ORIGINS_LIST or "*"}})

from . import routes, equalizacoes, tarefas
