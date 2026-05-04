import os
import logging
import subprocess
import tempfile

logger = logging.getLogger(__name__)

def get_audio_duration(audio_file_path: str) -> float:
    """
    Gets the duration of an audio file in seconds using ffprobe.
    Falls back to 0.0 if ffprobe is not installed (skips chunking).
    """
    try:
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            audio_file_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        duration = float(result.stdout.strip())
        return duration
    except FileNotFoundError:
        logger.warning("ffprobe not found — skipping duration check, sending audio directly.")
        return 0.0  # Treat as short audio, skip chunking
    except subprocess.CalledProcessError as e:
        logger.error(f"ffprobe error: {e.stderr}")
        return 0.0
    except Exception as e:
        logger.error(f"Error getting audio duration: {e}")
        return 0.0


def split_audio_into_chunks(audio_file_path: str, chunk_duration_seconds: int = 25) -> list:
    """
    Splits an audio file into chunks of specified duration using ffmpeg.
    
    Args:
        audio_file_path: Path to the audio file
        chunk_duration_seconds: Duration of each chunk in seconds (default: 25s to stay under 30s limit)
    
    Returns:
        List of paths to chunk files
    """
    try:
        logger.info(f"Splitting audio file: {audio_file_path}")
        
        # Get total duration
        total_duration = get_audio_duration(audio_file_path)
        logger.info(f"Total audio duration: {total_duration:.2f}s")
        
        chunk_paths = []
        chunk_number = 0
        start_time = 0
        
        # Split into chunks
        while start_time < total_duration:
            chunk_number += 1
            
            # Create temp file for chunk
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
            chunk_path = temp_file.name
            temp_file.close()
            
            # Use ffmpeg to extract chunk
            cmd = [
                'ffmpeg',
                '-i', audio_file_path,
                '-ss', str(start_time),
                '-t', str(chunk_duration_seconds),
                '-acodec', 'pcm_s16le',  # WAV format
                '-ar', '16000',  # 16kHz sample rate
                '-ac', '1',  # Mono
                '-y',  # Overwrite output file
                chunk_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                logger.error(f"ffmpeg error: {result.stderr}")
                raise Exception(f"Failed to create chunk {chunk_number}")
            
            chunk_paths.append(chunk_path)
            logger.info(f"Created chunk {chunk_number}: {chunk_path}")
            
            start_time += chunk_duration_seconds
        
        logger.info(f"Split audio into {len(chunk_paths)} chunks")
        return chunk_paths
        
    except Exception as e:
        logger.error(f"Error splitting audio: {e}")
        # Clean up any created chunks
        for path in chunk_paths:
            if os.path.exists(path):
                os.remove(path)
        raise Exception(f"Failed to split audio: {str(e)}")


def cleanup_chunks(chunk_paths: list):
    """
    Deletes temporary chunk files.
    
    Args:
        chunk_paths: List of paths to chunk files
    """
    for chunk_path in chunk_paths:
        try:
            if os.path.exists(chunk_path):
                os.remove(chunk_path)
                logger.info(f"Cleaned up chunk: {chunk_path}")
        except Exception as e:
            logger.warning(f"Failed to cleanup chunk {chunk_path}: {e}")

