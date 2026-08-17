import os
import glob
import concurrent.futures
import matplotlib.pyplot as plt
import numpy as np
import sunpy.map
from sunpy.net import Fido, attrs as a
from sunpy.coordinates import ephemeris, sun
import astropy.units as u

# --- Configuration ---
DOWNLOAD_DIR = "tmp/lasco_fits_data"
OUTPUT_MOVIE = "lasco_c2_running_diff_equator.mp4"

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

soho_coord = ephemeris.get_horizons_coord('SOHO', '2024-05-10 12:00:00')
solar_radius_arcsec = sun.angular_radius('2024-05-10 12:00:00').to_value(u.arcsec)

# Helper function to normalize mixed shapes (512x512 to 1024x1024)
def make_1024_target_header(reference_map):
    new_meta = reference_map.meta.copy()
    # If the base map is 1024x1024, adjust pixels and step sizes down to 512x512
    if reference_map.data.shape == (1024, 1024):
        new_meta['naxis1'], new_meta['naxis2'] = 512, 512
        new_meta['cdelt1'] = reference_map.meta['cdelt1'] * 2.0
        new_meta['cdelt2'] = reference_map.meta['cdelt2'] * 2.0
        new_meta['crpix1'] = (reference_map.meta['crpix1'] + 0.5) / 2.0
        new_meta['crpix2'] = (reference_map.meta['crpix2'] + 0.5) / 2.0
    else:
        # Already 512x512, keep sizes intact
        new_meta['naxis1'], new_meta['naxis2'] = 512, 512
    
    new_meta['hgln_obs'] = soho_coord.lon.to_value(u.deg)
    new_meta['hglt_obs'] = soho_coord.lat.to_value(u.deg)
    new_meta['dsun_obs'] = soho_coord.radius.to_value(u.m)
        
    return sunpy.map.Map(np.zeros((512, 512)), new_meta)

# Individual pair worker task (Executed in parallel processes)
def process_single_pair(pair_paths):
    path_t0, path_t1 = pair_paths
    
    # Read files inside the independent worker process
    map_t0 = sunpy.map.Map(path_t0)
    map_t1 = sunpy.map.Map(path_t1)

    print(map_t0.meta)

    # КРИТЕРИЙ 1: Проверка времени экспозиции.
    # Нормальный кадр LASCO C2 экспонируется около 20-30 секунд. 
    # Если EXPTIME < 5 секунд, это калибровочный шум или технический сбой.
    exp_t0 = map_t0.meta.get('EXPTIME', 0)
    exp_t1 = map_t1.meta.get('EXPTIME', 0)
    if exp_t0 < 5.0 or exp_t1 < 5.0:
        print(f" [Filtered] Dropping short exposure: {exp_t0}s or {exp_t1}s")
        return None

    # КРИТЕРИЙ 2: Проверка на поврежденную матрицу (Telemetry dropouts).
    # Если более 30% пикселей в файле битые (NaN) или равны абсолютному нулю — файл поврежден.
    total_pixels = map_t1.data.size
    nan_count = np.isnan(map_t1.data).sum()
    zero_count = (map_t1.data == 0).sum()
    
    if (nan_count + zero_count) / total_pixels > 0.30:
        print(f" [Filtered] Dropping corrupted telemetry frame: {path_t1}")
        return None
        
    # КРИТЕРИЙ 3: Проверка на резкий неестественный скачок средней яркости.
    # Если среднее значение кадра отличается от предыдущего в десятки раз — это артефакт.
    mean_t0 = np.nanmean(map_t0.data)
    mean_t1 = np.nanmean(map_t1.data)
    if mean_t0 > 0 and mean_t1 > 0:
        ratio = mean_t1 / mean_t0
        if ratio > 10.0 or ratio < 0.1:
            print(f" [Filtered] Dropping brightness anomaly. Ratio: {ratio:.2f}")
            return None
    
    # Spatial resampling
    target_t0 = make_1024_target_header(map_t0)
    print(0)
    target_t1 = make_1024_target_header(map_t1)
    print(1)
    resampled_t0 = map_t0.reproject_to(target_t0.wcs)
    print(111)
    resampled_t1 = map_t1.reproject_to(target_t1.wcs)
    print(2)
    
    # Calculate running difference
    data_t0 = np.nan_to_num(resampled_t0.data, nan=0.0).astype(np.float64)
    data_t1 = np.nan_to_num(resampled_t1.data, nan=0.0).astype(np.float64)
    diff_data = data_t1 - data_t0
    
    # Clean and inject metadata
    diff_meta = resampled_t1.meta.copy()
    for key in ['datamin', 'datamax', 'bzero', 'bscale', 'absolute', 'photmeas']:
        diff_meta.pop(key, None)
        diff_meta.pop(key.upper(), None)
        
    diff_meta['hgln_obs'] = soho_coord.lon.to_value(u.deg)
    diff_meta['hglt_obs'] = soho_coord.lat.to_value(u.deg)
    diff_meta['dsun_obs'] = soho_coord.radius.to_value(u.m)
    diff_meta['obsrvtry'] = 'SOHO'
    diff_meta['instrument'] = 'LASCO'
    diff_meta['detector'] = 'C2'
    diff_meta['rsun_obs'] = solar_radius_arcsec 
    diff_meta['rsun_ref'] = 695700000.0    
    
    # Re-package and rotate/resample to final geometry
    temp_diff_map = sunpy.map.Map(diff_data, diff_meta)
    rotated_map_raw = temp_diff_map.rotate(missing=0.0, order=3)
    final_rotated_map = rotated_map_raw.resample((512, 512) * u.pix)
    print(3)
    
    return final_rotated_map

# Protect entry point (mandatory for Python multiprocessing)
if __name__ == "__main__":
    # 1. Download or load files from disk
    existing_fits_files = sorted(glob.glob(os.path.join(DOWNLOAD_DIR, "*.fts")))
    if not existing_fits_files:
        print("No local data found. Running download...")
        result = Fido.search(
            a.Time("2024-05-10 00:00:00", "2024-05-10 23:00:00"), 
            a.Instrument.lasco,
            a.Detector.c2
        )
        downloaded_paths = sorted(Fido.fetch(result, path=f"{DOWNLOAD_DIR}/{{file}}"))
    else:
        print(f"Using {len(existing_fits_files)} files from disk.")
        downloaded_paths = existing_fits_files

    # Create overlapping tuples: (frame0, frame1), (frame1, frame2), etc.
    file_pairs = [(downloaded_paths[i-1], downloaded_paths[i]) for i in range(1, len(downloaded_paths))]

    # 2. RUN PARALLELIZED POOL
    print(f"\nProcessing {len(file_pairs)} pairs across all available CPU cores...")
    diff_maps = []
    
    # max_workers=None automatically checks total CPU core availability
    with concurrent.futures.ProcessPoolExecutor(max_workers=None) as executor:
        # map preserves the original chronological order of file_pairs natively
        results = executor.map(process_single_pair, file_pairs[:2])
        diff_maps = [m for m in results if m is not None]

    print("\nAll frames processed parallelly. Creating MapSequence...")
    sequence = sunpy.map.MapSequence(diff_maps)

    # 3. ANIMATION COMPILING
    import matplotlib.animation as animation
    fig = plt.figure(figsize=(5.12, 5.12))
    fig.subplots_adjust(left=0, bottom=0, right=1, top=1, wspace=0, hspace=0)

    ax = fig.add_subplot(projection=sequence[0])
    ax.set_axis_off()

    im = ax.imshow(sequence[0].data, cmap='gray', origin='lower')

    timestamp_text = ax.text(
        0.02, 0.95,               # Положение текста (X, Y) от 0 до 1
        "",                       # Изначально текст пустой
        transform=ax.transAxes,   # Привязка к координатам экрана, а не космоса
        color="white",            # Цвет шрифта
        fontsize=14,              # Размер шрифта
        fontweight="bold",        # Жирный шрифт
        # Добавляем небольшую полупрозрачную черную подложку, чтобы текст читался на любом фоне
        bbox=dict(facecolor='black', alpha=0.5, edgecolor='none', boxstyle='round,pad=0.3')
    )

    def update_frame(frame_index):
        current_map = sequence[frame_index]
        v_max = np.percentile(np.abs(np.nan_to_num(current_map.data)), 98)
        if v_max == 0: v_max = 1.0
        im.set_data(current_map.data)
        im.set_clim(vmin=-v_max, vmax=v_max)

        formatted_date = current_map.date.strftime('%Y-%m-%d %H:%M:%S')
        timestamp_text.set_text(f"LASCO C2 | {formatted_date}")
        return [im, timestamp_text]

    print(f"Compiling video stream with FFmpeg into: '{OUTPUT_MOVIE}'...")
    ani = animation.FuncAnimation(fig, update_frame, frames=len(sequence), blit=False)

    try:
        FFmpegWriter = animation.writers['ffmpeg']
        writer = FFmpegWriter(fps=8, bitrate=2400, extra_args=['-pix_fmt', 'yuv420p', '-profile:v', 'high', '-preset', 'medium'])
        ani.save(OUTPUT_MOVIE, writer=writer)
        print("MP4 video successfully compiled!")
    except KeyError:
        print("\n[Dependency Error] FFmpeg writer not found.")

    plt.close()