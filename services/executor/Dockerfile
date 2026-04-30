# syntax=docker/dockerfile:1.7
FROM alpine:3.23

RUN apk add --no-cache \
      bash \
      coreutils \
      findutils \
      curl \
      ca-certificates \
      git \
      jq \
      python3 \
      py3-pip \
      nodejs \
      npm \
      tini \
 && adduser -D -u 1000 kairos \
 && mkdir -p /workspace \
 && chown kairos:kairos /workspace

USER kairos
WORKDIR /workspace

ENV PATH="/home/kairos/.local/bin:${PATH}"

ENTRYPOINT ["/sbin/tini","--"]
CMD ["/bin/bash","-lc","echo 'kairos-executor ready; awaiting command'"]
