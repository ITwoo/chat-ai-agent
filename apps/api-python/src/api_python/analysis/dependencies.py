from typing import Annotated

from fastapi import Depends

from api_python.analysis.client import (
    AnalysisClientService,
    analysis_client_service,
)


def get_analysis_client_service(
) -> AnalysisClientService:
    return analysis_client_service


AnalysisClientDependency = Annotated[
    AnalysisClientService,
    Depends(get_analysis_client_service),
]