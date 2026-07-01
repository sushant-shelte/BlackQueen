"""Minimal application entrypoint for Render compatibility."""
from typing import Any, Callable


class _MinimalApp:
    def __init__(self) -> None:
        self.routes: list[tuple[str, str, Callable[..., Any]]] = []

    def get(self, path: str):
        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            self.routes.append(("GET", path, func))
            return func
        return decorator

    def __call__(self, scope: dict[str, Any], receive: Callable[..., Any], send: Callable[..., Any]) -> None:
        if scope.get("type") != "http":
            return

        path = scope.get("path", "/")
        method = scope.get("method", "GET")

        for route_method, route_path, handler in self.routes:
            if route_method == method and route_path == path:
                response = handler()
                body = str(response).encode("utf-8")
                send({
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [(b"content-type", b"application/json")],
                })
                send({
                    "type": "http.response.body",
                    "body": body,
                })
                return

        send({
            "type": "http.response.start",
            "status": 404,
            "headers": [(b"content-type", b"application/json")],
        })
        send({
            "type": "http.response.body",
            "body": b'{"detail":"Not Found"}',
        })


app = _MinimalApp()


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "healthy", "version": "1.0.0"}


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Black Queen API", "version": "1.0.0"}
