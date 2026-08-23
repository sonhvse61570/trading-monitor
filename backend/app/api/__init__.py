"""API router registry — aggregate all domain routers here.

Adding a new domain: create app/api/<domain>.py with an APIRouter,
then include it below. Keeps main.py clean.
"""
from fastapi import APIRouter

from app.api import analysis, intel, screener

api_router = APIRouter()
api_router.include_router(analysis.router)
api_router.include_router(intel.router)
api_router.include_router(screener.router)
