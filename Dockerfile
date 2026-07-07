# Статичный сайт atamuragroup.kz на nginx
FROM nginx:1.27-alpine

# конфиг сайта
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/site.conf

# статические файлы сайта
COPY . /usr/share/nginx/html

# внутри контейнера nginx слушает 8080 (unprivileged-friendly)
EXPOSE 8080

# healthcheck: главная страница должна отдаваться
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
