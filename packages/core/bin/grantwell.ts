#!/usr/bin/env node
import * as path from 'node:path';
import { runGrantWellApp } from '../lib/app';
import { instances } from './instances';

// The source repo builds the sibling UI package, not an installed one.
runGrantWellApp(instances, { uiSourceDir: path.join(__dirname, '..', '..', 'ui') });
