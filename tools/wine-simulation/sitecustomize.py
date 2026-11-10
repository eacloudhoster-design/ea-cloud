"""Defense in depth for this simulation-only fixture; Docker also has no network."""
import importlib.abc
import socket
import sys


class NoVendor(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0].lower() == 'metatrader5':
            raise ImportError('Vendor SDK forbidden in isolated Wine fixture')


sys.meta_path.insert(0, NoVendor())
_connect = socket.socket.connect
_connect_ex = socket.socket.connect_ex
_sendto = socket.socket.sendto


def check(sock):
    if sock.family in (socket.AF_INET, socket.AF_INET6):
        raise PermissionError('IP networking forbidden in isolated Wine fixture')


def connect(sock, address):
    check(sock)
    return _connect(sock, address)


def connect_ex(sock, address):
    check(sock)
    return _connect_ex(sock, address)


def sendto(sock, *args):
    check(sock)
    return _sendto(sock, *args)


socket.socket.connect = connect
socket.socket.connect_ex = connect_ex
socket.socket.sendto = sendto
