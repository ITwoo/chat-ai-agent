import math


def serialize_vector(
    vector: list[float],
) -> str:
    if not vector:
        raise ValueError(
            "빈 벡터는 직렬화할 수 없습니다."
        )

    if not all(
        math.isfinite(value)
        for value in vector
    ):
        raise ValueError(
            "벡터에 유효하지 않은 숫자가 포함돼 있습니다."
        )

    return (
        "["
        + ",".join(str(value) for value in vector)
        + "]"
    )