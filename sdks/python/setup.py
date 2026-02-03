"""Setup configuration for xache package"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="xache",
    version="5.0.0",
    author="Xache Protocol",
    author_email="hello@xache.ai",
    description="Official Python SDK for Xache Protocol - decentralized agent memory and collective intelligence",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/xache-ai/xache-protocol",
    project_urls={
        "Documentation": "https://docs.xache.ai",
        "Source": "https://github.com/xache-ai/xache-protocol",
        "Bug Reports": "https://github.com/xache-ai/xache-protocol/issues",
    },
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.8",
    install_requires=[
        "aiohttp>=3.9.0",
        "typing-extensions>=4.0.0",
        "PyNaCl>=1.5.0",
        "eth-account>=0.10.0",
        "solders>=0.18.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-asyncio>=0.21.0",
            "pytest-cov>=4.0.0",
            "black>=23.0.0",
            "mypy>=1.0.0",
            "pylint>=2.17.0",
        ],
    },
    keywords="xache ai agent memory blockchain decentralized collective-intelligence",
)
