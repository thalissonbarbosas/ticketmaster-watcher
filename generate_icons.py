"""
Generate extension icons (purple square with a ticket-ish look).
No external dependencies — pure stdlib.
Run once: python3 generate_icons.py
"""
import struct, zlib, os

def make_png(size, filename):
    # Purple (#7c3aed) background with a lighter center band
    def pixel(x, y):
        # Horizontal stripe as a rough "ticket" motif
        band = size // 5
        if band < y < size - band:
            return (124, 58, 237)   # main purple
        return (109, 40, 217)       # slightly darker edge

    rows = b''
    for y in range(size):
        row = b'\x00'  # filter type = None
        for x in range(size):
            r, g, b = pixel(x, y)
            row += bytes([r, g, b])
        rows += row

    def chunk(name, data):
        c = struct.pack('>I', len(data)) + name + data
        return c + struct.pack('>I', zlib.crc32(name + data) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png  = (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(rows))
            + chunk(b'IEND', b''))

    with open(filename, 'wb') as f:
        f.write(png)
    print(f'  created {filename}')

os.makedirs('icons', exist_ok=True)
for size in (16, 48, 128):
    make_png(size, f'icons/icon{size}.png')
print('Done.')
