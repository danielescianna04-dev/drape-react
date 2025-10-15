#!/bin/bash

echo "🚀 Fast deploy con Cloud Build..."
gcloud builds submit --config cloudbuild.yaml .
