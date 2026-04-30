from app.schemas.schedule import OptimizerMetadata


MILP_NOT_IMPLEMENTED_REASON = (
    "MILP solver timeout or infeasible; fell back to window_v1 scheduler."
)
WINDOW_OPTIMIZER_VERSION = "window_v1.2"


def build_optimizer_metadata(
    requested_mode: str = "window_v1",
    used_mode: str = "window_v1",
    fallback_used: bool = False,
    fallback_reason: str | None = None,
    model_version: str = WINDOW_OPTIMIZER_VERSION,
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
    if requested_mode == "window_v1":
        return build_optimizer_metadata(requested_mode=requested_mode)

    if requested_mode == "milp":
        return build_optimizer_metadata(
            requested_mode=requested_mode,
            fallback_used=True,
            fallback_reason=MILP_NOT_IMPLEMENTED_REASON,
            solver_status="not_implemented",
        )

    return build_optimizer_metadata(
        requested_mode=requested_mode,
        fallback_used=True,
        fallback_reason=MILP_NOT_IMPLEMENTED_REASON,
    )
