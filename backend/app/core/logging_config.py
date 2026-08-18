import logging
import sys


def setup_logging(debug: bool = True) -> logging.Logger:
    """Configures application-wide logging with structured output."""
    log_level = logging.DEBUG if debug else logging.INFO
    log_format = "%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d - %(message)s"
    
    # Configure root logger
    logging.basicConfig(
        level=log_level,
        format=log_format,
        handlers=[logging.StreamHandler(sys.stdout)],
        force=True,
    )
    
    # Suppress verbose third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)
    logging.getLogger("py4j").setLevel(logging.WARN)
    
    logger = logging.getLogger("spark_compiler")
    logger.setLevel(log_level)
    return logger


logger = setup_logging()
