from fastapi import HTTPException


class AppException(HTTPException):
    """TextForge 统一业务异常。

    继承 HTTPException，额外携带 error_code 以便前端或网关统一处理。
    """

    def __init__(
        self,
        status_code: int = 400,
        detail: str = "操作失败",
        error_code: str = "BAD_REQUEST",
    ):
        """初始化 AppException。

        Args:
            status_code: HTTP 状态码。
            detail: 错误描述。
            error_code: 业务错误码，用于客户端区分错误类型。
        """
        super().__init__(status_code=status_code, detail=detail)
        self.error_code = error_code
