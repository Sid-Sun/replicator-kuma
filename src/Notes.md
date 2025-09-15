db config: data/db-config.json

embedded: 
{
    "type": "embedded-mariadb",
    "port": 3306,
    "hostname": "",
    "username": "",
    "password": "",
    "dbName": "kuma"
}
sock file: data/run/mariadb.sock

custom mariadb::
{
    "type": "mariadb",
    "port": 3306,
    "hostname": "eros",
    "username": "uptimekuma",
    "password": "admin1234",
    "dbName": "uptimekuma"
}

sqlite:
{
    "type": "sqlite"
}

