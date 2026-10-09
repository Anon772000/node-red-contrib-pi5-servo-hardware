"""Read one identified Heltec's USB serial stream using Linux standard libraries."""
import argparse
import array
import fcntl
import os
from pathlib import Path
import select
import sys
import termios
import time

def normalise(value):
    return ''.join(c for c in value.lower() if c.isalnum())

def find_device(serial_number):
    for tty in Path('/sys/class/tty').glob('ttyACM*'):
        device=(tty/'device').resolve()
        for parent in device.parents:
            if not (parent/'idVendor').exists():
                continue
            if (parent/'idVendor').read_text().strip()=='303a' and normalise((parent/'serial').read_text().strip())==normalise(serial_number):
                return Path('/dev')/tty.name
            break
    return None

def stream(path, baud=115200):
    descriptor=os.open(path,os.O_RDWR|os.O_NOCTTY|os.O_NONBLOCK)
    try:
        fcntl.flock(descriptor,fcntl.LOCK_EX|fcntl.LOCK_NB)
        attributes=termios.tcgetattr(descriptor)
        attributes[0]=0;attributes[1]=0
        attributes[2]=termios.CS8|termios.CREAD|termios.CLOCAL
        attributes[3]=0
        speed=getattr(termios, 'B'+str(baud))
        attributes[4]=speed;attributes[5]=speed
        attributes[6][termios.VMIN]=0;attributes[6][termios.VTIME]=0
        termios.tcsetattr(descriptor,termios.TCSANOW,attributes)
        try:
            fcntl.ioctl(descriptor,termios.TIOCMBIS,array.array('i',[termios.TIOCM_DTR]))
        except OSError:
            pass
        print('Heltec USB connected: '+str(path),file=sys.stderr,flush=True)
        while True:
            ready,_,_=select.select([descriptor],[],[],2)
            if not ready:
                continue
            data=os.read(descriptor,4096)
            if not data:
                raise OSError('USB disconnected')
            sys.stdout.buffer.write(data);sys.stdout.buffer.flush()
    finally:
        os.close(descriptor)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--usb-serial',required=True)
    parser.add_argument('--baud',type=int,choices=[9600,19200,38400,57600,115200],default=115200)
    arguments=parser.parse_args()
    waiting=False
    while True:
        device=find_device(arguments.usb_serial)
        if device is None:
            if not waiting:
                print('Waiting for the Heltec USB connection',file=sys.stderr,flush=True)
            waiting=True;time.sleep(2);continue
        waiting=False
        try:
            stream(device, arguments.baud)
        except (OSError,termios.error) as error:
            print('Heltec USB retry: '+str(error),file=sys.stderr,flush=True)
            time.sleep(2)

if __name__=='__main__':
    main()
