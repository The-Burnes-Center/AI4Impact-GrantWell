#!/usr/bin/env node
import { runGrantWellApp } from "grantwell-core";
import { instances } from "../config/instances";

runGrantWellApp(instances);
