# Blog Social Scraper
## Overview

`blog-social-scraper` is a custom Node.js script specifically developed for how my personal site at [blog.mitcdh.au](https://blog.mitcdh.au) works, but it might help you too. This tool automates the process of extracting multimedia content from a designated YouTube channel and a Flickr user account, allowing them to be output into markdown files for populating a blog. It streamlines my workflow by automatically generating Hugo-compatible blog posts.

## Prerequisites

*  Node.js installed on your system.
*  API access set up for YouTube and Flickr (API keys required).
*  Optionally, a static site generator is installed (for example, to run `Hugo`).

## Installation and Setup

1.  Clone the Repository: Clone this repository to your machine with submodules `git clone --recurse-submodules -j8 https://github.com/mitcdh/blog-social-scraper`.
2.  Set API Keys and Build Command: Define necessary API keys (`FLICKR_API_KEY`, `YOUTUBE_API_KEY`) and `BUILD_COMMAND` in your environment or a `.env` file.
3.  Edit the heredoc with the post format you desire.

## Running the Script

1.  Execute: Run the script with `node blog-social-scraper`.
2.  Build Process: If `BUILD_COMMAND` is set, the script will execute it and include its output and status in the final JSON report.

## Troubleshooting

*  Any albums prefixed with a '#' or '@' will be excepted as it's assumed they are either compiliations or one off transfers of pictures.
*  Confirm the correct setup of the required API keys.
*  Refer to the console output for detailed error messages if errors occur.
*  Ensure the build command (if utilized) is properly configured and functional.
