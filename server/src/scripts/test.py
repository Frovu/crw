import matplotlib.animation as animation
import matplotlib.pyplot as plt
import numpy as np
import sunpy.map
from sunpy.coordinates import ephemeris
from sunpy.net import Fido, attrs as a
import os, glob
from astropy import units as u

DOWNLOAD_DIR = "tmp/lasco_fits_data"
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Define a standard reference coordinate frame header (1024x1024)
def make_1024_target_header(reference_map):
    """Creates a metadata template for a uniform 1024x1024 grid based on the original map."""
    new_meta = reference_map.meta.copy()
    
    # Scale pixel coordinates and step sizes if the base map is 512x512
    if reference_map.data.shape == (512, 512):
        new_meta['naxis1'] = 1024
        new_meta['naxis2'] = 1024
        new_meta['cdelt1'] = reference_map.meta['cdelt1'] / 2.0
        new_meta['cdelt2'] = reference_map.meta['cdelt2'] / 2.0
        new_meta['crpix1'] = (reference_map.meta['crpix1'] * 2.0) - 0.5
        new_meta['crpix2'] = (reference_map.meta['crpix2'] * 2.0) - 0.5
    else:
        # If it's already 1024x1024, keep sizes intact
        new_meta['naxis1'] = 1024
        new_meta['naxis2'] = 1024
        
    return sunpy.map.Map(np.zeros((1024, 1024)), new_meta)

existing_fits_files = sorted(glob.glob(os.path.join(DOWNLOAD_DIR, "*.fts")))

if not existing_fits_files:
    print("No local data found. Running download for the first time...")
    
    # Search and download FITS files directly to the disk folder
    result = Fido.search(
        a.Time("2024-05-10 12:00:00", "2024-05-10 15:00:00"), # 3-hour window
        a.Instrument.lasco,
        a.Detector.c2
    )


    print(f"Found {len(result)} files. Downloading directly to disk path: '{DOWNLOAD_DIR}'...")
    downloaded_files = sorted(Fido.fetch(result, path=f"{DOWNLOAD_DIR}/{{file}}"))
else:
    print(f"Local data found! Skipping download. Using {len(existing_fits_files)} files from disk.")
    downloaded_files = existing_fits_files


# 3. Вычисление бегущей разности и поворот по экватору
print("Обработка кадров (вычисление разности и выравнивание по экватору)...")
diff_maps = []

for i in range(1, len(downloaded_files)):
    print(f" Processing pair {i}/{len(downloaded_files)-1}...", end="\r")
    
    # Read only two files from disk at any given time
    map_t0 = sunpy.map.Map(downloaded_files[i-1])
    map_t1 = sunpy.map.Map(downloaded_files[i])
    
    # 1. Create a uniform target map template for both timesteps
    target_t0 = make_1024_target_header(map_t0)
    target_t1 = make_1024_target_header(map_t1)
    
    # 2. Resample both frames to a clean, matching 1024x1024 coordinate system
    # This automatically handles any differences in alignment or resolution
    resampled_t0 = map_t0.reproject_to(target_t0.wcs)
    resampled_t1 = map_t1.reproject_to(target_t1.wcs)
    
    # 3. Safe conversion to float arrays now that shapes strictly match (1024, 1024)
    data_t0 = np.nan_to_num(resampled_t0.data, nan=0.0).astype(np.float64)
    data_t1 = np.nan_to_num(resampled_t1.data, nan=0.0).astype(np.float64)
    
    
    # Вычисляем разность
    diff_data = data_t1 - data_t0


    soho_coord = ephemeris.get_horizons_coord('SOHO', resampled_t1.date)

    diff_meta = resampled_t1.meta.copy()
    for key in ['datamin', 'datamax', 'bzero', 'bscale', 'absolute', 'photmeas']:
        diff_meta.pop(key, None)
        diff_meta.pop(key.upper(), None)

    diff_meta['hgln_obs'] = soho_coord.lon.to_value(u.deg)
    diff_meta['hglat_obs'] = soho_coord.lat.to_value(u.deg)
    diff_meta['dsun_obs'] = soho_coord.radius.to_value(u.m)
    
    # Re-package into a clean SunPy Map
    temp_diff_map = sunpy.map.Map(diff_data, diff_meta)
    
    # Поворачиваем по Солнечному Северу (автоматически выравнивает экватор по горизонтали)
    # missing=0.0 заполняет пустые углы после вращения серым нейтральным цветом
    rotated_map = temp_diff_map.rotate(missing=0.0, order=3).resample((1024, 1024) * u.pix)
    diff_maps.append(rotated_map)

# 4. Объединяем обработанные кадры в последовательность SunPy
sequence = sunpy.map.MapSequence(diff_maps)

# 3. FIXED ANIMATION: Manual rendering over MapSequence frames
fig = plt.figure(figsize=(8, 8))
# Use the WCS projection of the first map explicitly
ax = fig.add_subplot(projection=sequence[0].wcs)

# Strictly isolate data for contrast calculation
all_data = np.nan_to_num(sequence.data)
v_max = np.percentile(np.abs(all_data), 98)
if v_max == 0: v_max = 1.0

# Render the initial frame as a static image object
im = ax.imshow(sequence[0].data, vmin=-v_max, vmax=v_max, cmap='gray', origin='lower')

# Set aesthetic features
ax.coords[0].set_ticks_visible(False)
ax.coords[1].set_ticks_visible(False)
ax.coords[0].set_ticklabel_visible(False)
ax.coords[1].set_ticklabel_visible(False)
ax.axhline(0, color='cyan', linestyle='--', alpha=0.4)
title = ax.set_title(f"LASCO C2 Running Difference\n{sequence[0].date.strftime('%Y-%m-%d %H:%M:%S')}")

# Explicit update frame logic to prevent Matplotlib pipeline re-scaling
def update_frame(frame_index):
    current_map = sequence[frame_index]
    # Update only pixel data, keeping image normalization completely locked
    im.set_data(current_map.data)
    title.set_text(f"LASCO C2 Running Difference\n{current_map.date.strftime('%Y-%m-%d %H:%M:%S')}")
    return [im, title]

# 4. Compile directly with FFmpeg
print(f"Compiling video stream with FFmpeg...")
ani = animation.FuncAnimation(fig, update_frame, frames=len(sequence), blit=True)

# Накладываем линию экватора (опционально)
ax.axhline(0, color='blue', linestyle='--', alpha=0.3)

# 6. Сохранение в MP4 файл с помощью FFmpeg
output_movie = "lasco_c2_running_diff_equator.mp4"
print(f"Рендеринг и сохранение файла {output_movie}...")

FFmpegWriter = animation.writers['ffmpeg']
writer = FFmpegWriter(fps=8, metadata=dict(artist='SunPy Python Script'), bitrate=2500)

ani.save(output_movie, writer=writer)
plt.close()

print("Видео успешно создано!")
