from app.schemas.schedule import OptimizerMetadata


MILP_OPTIMIZER_VERSION = "milp_v1"


def build_optimizer_metadata(
    requested_mode: str = "milp",
    used_mode: str = "milp",
    fallback_used: bool = False,
    fallback_reason: str | None = None,
    model_version: str = MILP_OPTIMIZER_VERSION,
    is_optimal: bool = False,
    solver_status: str | None = None,
) -> OptimizerMetadata:
    return OptimizerMetadata(
        requested_mode=requested_mode,
        used_mode=used_mode,
        fallback_used=fallback_used,
        fallback_reason=fallback_reason,
        model_version=model_version,
        is_optimal=is_optimal,
        solver_status=solver_status,
    )


def optimizer_metadata_for_request(requested_mode: str) -> OptimizerMetadata:
    return build_optimizer_metadata(requested_mode=requested_mode, used_mode="milp")
