"""The words that untell listen scores each track against (zero-shot, with CLAP).

Each category holds plain words. prompt() puts a word in a sentence that the audio-text model reads well.
Add a word here when a brief needs it; the scores of the other words do not change.
"""
VOCAB = {
    "mood": ["hype", "energetic", "aggressive", "tense", "dark", "ominous", "epic", "triumphant", "uplifting", "hopeful",
             "happy", "playful", "quirky", "confident", "cool", "warm", "calm", "relaxed", "dreamy", "melancholic", "sad",
             "romantic", "mysterious", "suspenseful", "nostalgic", "serious", "minimal", "groovy", "sexy", "chill"],
    "genre": ["trap", "hip hop", "lo-fi hip hop", "house", "techno", "electronic dance music", "dubstep", "drum and bass",
              "synthwave", "pop", "indie pop", "rock", "funk", "jazz", "big band swing", "noir jazz", "ambient", "cinematic orchestral",
              "solo piano", "acoustic folk", "ukulele pop", "corporate pop", "chiptune", "reggaeton", "afrobeat", "classical"],
    "use": ["SaaS product launch", "tech product demo", "sports ad", "fitness workout", "fashion runway", "film trailer",
            "documentary", "lo-fi study session", "kids video", "corporate presentation", "luxury brand ad", "travel vlog",
            "cooking video", "video game menu", "news intro", "horror scene", "meditation", "party", "car commercial", "wedding video"],
    "texture": ["a repetitive looping beat", "an evolving arrangement", "a build-up to a drop", "a big drop", "sparse and quiet",
                "dense and loud", "heavy 808 bass", "four on the floor kick", "swung rhythm", "live drums", "electronic drums",
                "no drums", "a catchy melody", "lead vocals", "vocal chops", "no vocals", "acoustic instruments", "synthesizers",
                "strings", "brass section", "piano", "guitar", "a clean ending", "a fade out"],
    "fx": ["whoosh", "impact", "boom", "click", "tick", "pop", "riser", "swell", "stamp", "bubble", "cork pop", "glitch",
           "camera shutter", "typing", "ding", "swoosh", "thud", "snap"],
}


TEMPLATES = {
    "mood": ["{} music", "a {} song", "this track feels {}"],
    "genre": ["{} music", "a {} track", "a song in the style of {}"],
    "use": ["music for a {}", "background music for a {}", "a soundtrack for a {}"],
    "texture": ["music with {}", "a track with {}", "{}"],
    "fx": ["the sound effect of a {}", "a {} sound", "{}"],
}


def prompts(category, word):
    """Several sentences for one word; their text embeddings are averaged, which steadies zero-shot scores."""
    return [t.format(word) for t in TEMPLATES[category]]


def prompt(category, word):
    if category == "mood":
        return f"{word} music"
    if category == "genre":
        return f"{word} music"
    if category == "use":
        return f"music for a {word}"
    if category == "fx":
        return f"the sound effect of a {word}"
    return f"music with {word}"
