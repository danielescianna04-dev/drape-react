#!/usr/bin/env ruby

# Script to add PreviewActivityModule files to Xcode project
# Run: ruby scripts/add-native-module-to-xcode.rb

require 'xcodeproj'

PROJECT_PATH = File.expand_path('../ios/Drape.xcodeproj', __dir__)
TARGET_NAME = 'Drape'

# Files to add to the main target
SWIFT_FILES = [
  'ios/Drape/PreviewActivityModule.swift',
  'ios/Drape/PreviewActivityModule.m'
]

puts "🟣 Adding PreviewActivityModule to Xcode project..."

# Open project
project = Xcodeproj::Project.open(PROJECT_PATH)
target = project.targets.find { |t| t.name == TARGET_NAME }

unless target
  puts "❌ Target '#{TARGET_NAME}' not found!"
  exit 1
end

# Find or create Drape group
drape_group = project.main_group.find_subpath('Drape', false)
unless drape_group
  puts "❌ Drape group not found in project!"
  exit 1
end

files_added = 0

SWIFT_FILES.each do |file_path|
  full_path = File.expand_path("../#{file_path}", __dir__)
  file_name = File.basename(file_path)

  # Check if file exists
  unless File.exist?(full_path)
    puts "⚠️  File not found: #{file_path}"
    next
  end

  # Check if already in project
  existing = drape_group.files.find { |f| f.path == file_name }
  if existing
    puts "✅ #{file_name} already in project"
    next
  end

  # Add file reference
  file_ref = drape_group.new_file(full_path)

  # Add to target's compile sources
  target.add_file_references([file_ref])

  puts "➕ Added #{file_name}"
  files_added += 1
end

if files_added > 0
  project.save
  puts "\n✅ Project saved! Added #{files_added} file(s)"
else
  puts "\n✅ No new files to add"
end

puts "\n📋 Next steps:"
puts "1. Open Xcode: cd ios && open Drape.xcworkspace"
puts "2. Add Widget Extension target manually (Xcode doesn't support this via xcodeproj)"
puts "3. See ios/PreviewWidgetExtension/README.md for detailed instructions"
