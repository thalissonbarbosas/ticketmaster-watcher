"""
Generate extension icons: Ticketmaster-blue background with a white uppercase "T".
No external dependencies — pure stdlib. Anti-aliased via 8x supersampling.
Run once: python3 generate_icons.py
"""
import struct, zlib, os

BG = (2, 108, 223)      # Ticketmaster blue (#026CDF)
FG = (255, 255, 255)    # white
SS = 8                  # supersampling factor

def glyph(fx, fy):
    """Uppercase 'T': top bar + centered vertical stem."""
    top_bar = 0.20 <= fx <= 0.80 and 0.20 <= fy <= 0.32
    stem = 0.43 <= fx <= 0.57 and 0.20 <= fy <= 0.80
    return top_bar or stem

def make_png(size, filename):
    rows = b''
    for y in range(size):
        row = b'\x00'  # filter type = None
        for x in range(size):
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    fx = (x * SS + sx + 0.5) / (size * SS)
                    fy = (y * SS + sy + 0.5) / (size * SS)
                    if glyph(fx, fy):
                        hits += 1
            a = hits / (SS * SS)
            r = round(BG[0] * (1 - a) + FG[0] * a)
            g = round(BG[1] * (1 - a) + FG[1] * a)
            b = round(BG[2] * (1 - a) + FG[2] * a)
            row += bytes([r, g, b])
        rows += row

    def chunk(name, data):
        c = struct.pack('>I', len(data)) + name + data
        return c + struct.pack('>I', zlib.crc32(name + data) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n'
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
