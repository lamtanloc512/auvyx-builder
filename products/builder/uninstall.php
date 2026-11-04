<?php
/**
 * Uninstall: removes Auvyx Builder settings, caches, MCP tokens, data source definitions and the AI agent's conversations. Content is never deleted — pages keep their blocks and
 * components (synced patterns) stay in the site. Content types are content too: their entries (posts and post meta)
 * and their definition (`auvyx_content_types`) are kept, so reinstalling brings every type back with its entries.
 *
 * @package Auvyx\Builder
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/** Per-site cleanup. */
function auvyx_builder_uninstall_site() {
	delete_option( 'auvyx_design_system' );
	delete_option( 'auvyx_builder_settings' );
	delete_option( 'auvyx_builder_ai' );
	delete_option( 'auvyx_license' );
	delete_option( 'auvyx_design_brief' );
	delete_option( 'auvyx_design_preset' );
	delete_option( 'auvyx_design_preset_previous' );
	delete_option( 'auvyx_design_fonts' );
	delete_option( 'auvyx_site_tools' );
	delete_option( 'auvyx_data_sources' );
	delete_option( 'auvyx_mcp_tokens' );
	delete_option( 'auvyx_mcp_audit' );
	delete_option( 'auvyx_mcp_vibe' );
	wp_clear_scheduled_hook( 'auvyx_license_check' );
	delete_transient( 'auvyx_component_locations' );
	delete_post_meta_by_key( '_auvyx_locations' );
	delete_post_meta_by_key( '_auvyx_part' );
	delete_post_meta_by_key( '_auvyx_conditions' );
	delete_transient( 'auvyx_site_parts' );
	// The AI agent's conversations (not page content).
	foreach ( get_posts(
		array(
			'post_type'     => 'auvyx_agent_session',
			'post_status'   => 'any',
			'numberposts'   => -1,
			'fields'        => 'ids',
			'no_found_rows' => true,
		)
	) as $auvyx_builder_session ) {
		wp_delete_post( (int) $auvyx_builder_session, true );
	}
	// Caches and the demo catalog's attribute map: options and transients named auvyx_demo_* and auvyx_editor_url_*.
	global $wpdb;
	foreach ( array( 'auvyx_demo_attribute_', '_transient_auvyx_demo_pack_', '_transient_timeout_auvyx_demo_pack_', '_transient_auvyx_editor_url_', '_transient_timeout_auvyx_editor_url_' ) as $auvyx_builder_prefix ) {
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like( $auvyx_builder_prefix ) . '%' ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery -- uninstall: options by prefix, no API for that.
	}
}

// Settings of earlier versions, when the optional Auvyx Cloud account lived here (now Auvyx Builder Pro's, docs/editions.md).
// Nothing is sent anywhere: Auvyx Builder talks to no server on uninstall.
delete_site_option( 'auvyx_license' );
delete_metadata( 'user', 0, 'auvyx_preset_draft', '', true );

if ( is_multisite() ) {
	foreach ( get_sites(
		array(
			'fields' => 'ids',
			'number' => 0,
		)
	) as $auvyx_builder_site_id ) {
		switch_to_blog( (int) $auvyx_builder_site_id );
		auvyx_builder_uninstall_site();
		restore_current_blog();
	}
} else {
	auvyx_builder_uninstall_site();
}
