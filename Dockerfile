FROM python:3.12-slim
LABEL org.opencontainers.image.source="https://github.com/aria2022/interview-app"
WORKDIR /app
COPY app.py .
USER 10001:10001
EXPOSE 8080
CMD ["python3", "app.py"]
