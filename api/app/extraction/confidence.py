"""Field confidence (TDD §5.3). The model's own score is only trusted to lower confidence."""

from app.config import get_settings

VALIDATOR_CAP = 0.4


def score(
    model_confidence: float | None, value: str | None, required: bool, validator_errors: list[str]
) -> float:
    if value is None or not value.strip():
        return 0.0 if required else 1.0
    s = max(0.0, min(1.0, model_confidence if model_confidence is not None else 0.0))
    if validator_errors:
        s = min(s, VALIDATOR_CAP)
    return round(s, 3)


def is_low(confidence: float) -> bool:
    return confidence < get_settings().confidence_threshold
